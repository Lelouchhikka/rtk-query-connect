# rtk-query-connect

Typed [RTK Query](https://redux-toolkit.js.org/rtk-query/overview) endpoints for [ConnectRPC](https://connectrpc.com/) / gRPC-Web services.

One line per RPC: request and response types come straight from your `.proto` files, and the protobuf quirks that break RTK Query out of the box are handled for you.

```ts
listTodos: rpcQuery(build, TodoService.method.listTodos, { providesTags: ["Todo"] }),
```

## Install

```bash
npm i rtk-query-connect @reduxjs/toolkit @connectrpc/connect @bufbuild/protobuf
```

Requires `@bufbuild/protobuf` v2 / `@connectrpc/connect` v2 (code generated with `protoc-gen-es` v2).

## Usage

```ts
import { configureStore } from "@reduxjs/toolkit";
import { createApi } from "@reduxjs/toolkit/query/react";
import { createConnectTransport } from "@connectrpc/connect-web";
import { connectBaseQuery, isConnectSerializable, rpcMutation, rpcQuery } from "rtk-query-connect";
import { TodoService } from "./gen/todo/v1/todo_pb";

const transport = createConnectTransport({ baseUrl: "https://api.example.com" });

export const api = createApi({
  baseQuery: connectBaseQuery({ transport }),
  tagTypes: ["Todo"],
  endpoints: (build) => ({
    listTodos: rpcQuery(build, TodoService.method.listTodos, { providesTags: ["Todo"] }),
    createTodo: rpcMutation(build, TodoService.method.createTodo, { invalidatesTags: ["Todo"] }),
  }),
});

export const { useListTodosQuery, useCreateTodoMutation } = api;

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer },
  middleware: (gDM) =>
    gDM({ serializableCheck: { isSerializable: isConnectSerializable } }).concat(api.middleware),
});
```

```tsx
function Todos({ ownerId }: { ownerId: bigint }) {
  const { data, error } = useListTodosQuery({ ownerId }); // arg typed as ListTodosRequest init
  if (error && "codeName" in error) return <p>{error.codeName}: {error.message}</p>;
  return <ul>{data?.todos.map((t) => <li key={String(t.id)}>{t.title}</li>)}</ul>;
}
```

Headers, auth and retries belong to the transport — use Connect [interceptors](https://connectrpc.com/docs/web/interceptors).

## What it handles

| Problem with a hand-rolled `baseQuery` | rtk-query-connect |
|---|---|
| Endpoint arg/result types written by hand | Inferred from the method descriptor |
| `int64` fields are `bigint` → RTK's default cache key (`JSON.stringify`) throws | Cache keys use canonical proto JSON (`listTodos({"ownerId":"1"})`); default-valued fields don't split the cache |
| `bigint` / `Uint8Array` / messages trigger "non-serializable value" warnings | `isConnectSerializable` for the serializable check middleware |
| `ConnectError` is a class instance, not storable in Redux | Mapped to a plain `RpcError { code, codeName, message, details }` |
| Requests aren't cancelled when RTK aborts them | RTK's `AbortSignal` is passed to the transport |
| Empty requests need `useXQuery({})` | `useXQuery()` works |

## API

- `connectBaseQuery({ transport })` — `baseQuery` for `createApi`.
- `rpcQuery(build, method, options?)` / `rpcMutation(build, method, options?)` — endpoint for a unary RPC. `options` are the usual RTK Query endpoint options (`providesTags`, `invalidatesTags`, `keepUnusedDataFor`, `onQueryStarted`, …).
- `isConnectSerializable(value)` — `isSerializable` for `serializableCheck`.
- `RpcError` — error type. `details` are raw (`{ type, value }`); decode with `fromBinary(Schema, detail.value)`.

## Roadmap

- [ ] Server-streaming RPCs into the cache via `onCacheEntryAdded`
- [ ] `protoc-gen-rtk-query` — generate endpoints and hooks with `buf generate`

## Development

```bash
pnpm install
pnpm test        # vitest, in-memory Connect router transport
pnpm typecheck
pnpm gen         # regenerate test/gen from test/proto
```

## License

MIT
