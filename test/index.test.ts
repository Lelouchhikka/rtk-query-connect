import { create } from "@bufbuild/protobuf";
import { timestampNow } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { configureStore } from "@reduxjs/toolkit";
import { createApi } from "@reduxjs/toolkit/query/react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { connectBaseQuery, isConnectSerializable, rpcMutation, rpcQuery } from "../src/index.js";
import { TodoSchema, TodoService } from "./gen/todo_pb.js";

function setup() {
  const todos = [create(TodoSchema, { id: 1n, title: "a", checksum: new Uint8Array([1]), createdAt: timestampNow() })];
  const transport = createRouterTransport(({ service }) =>
    service(TodoService, {
      listTodos: ({ ownerId }) => {
        if (ownerId === 404n) throw new ConnectError("no such owner", Code.NotFound);
        return { todos: todos.filter(() => ownerId <= 1n) };
      },
      createTodo: ({ title }) => {
        const todo = create(TodoSchema, { id: BigInt(todos.length + 1), title });
        todos.push(todo);
        return { todo };
      },
    }),
  );
  const api = createApi({
    baseQuery: connectBaseQuery({ transport }),
    tagTypes: ["Todo"],
    endpoints: (build) => ({
      listTodos: rpcQuery(build, TodoService.method.listTodos, { providesTags: ["Todo"] }),
      createTodo: rpcMutation(build, TodoService.method.createTodo, { invalidatesTags: ["Todo"] }),
    }),
  });
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (gDM) => gDM({ serializableCheck: { isSerializable: isConnectSerializable } }).concat(api.middleware),
  });
  return { api, store };
}

test("query returns typed messages and caches by int64 args", async () => {
  const { api, store } = setup();
  const errors = vi.spyOn(console, "error");

  const res = await store.dispatch(api.endpoints.listTodos.initiate({ ownerId: 1n }));
  expect(res.data?.todos.map((t) => t.title)).toEqual(["a"]);
  expectTypeOf(res.data!.todos[0]!.id).toEqualTypeOf<bigint>();

  const other = await store.dispatch(api.endpoints.listTodos.initiate({ ownerId: 2n }));
  expect(other.data?.todos).toEqual([]);
  expect(Object.keys(store.getState().api.queries)).toEqual(['listTodos({"ownerId":"1"})', 'listTodos({"ownerId":"2"})']);

  // Empty request may be omitted; it shares the cache entry with `{}`.
  const empty = await store.dispatch(api.endpoints.listTodos.initiate());
  expect(empty.data?.todos).toHaveLength(1);
  expect(Object.keys(store.getState().api.queries)).toContain("listTodos({})");

  expect(errors).not.toHaveBeenCalled();
});

test("mutation invalidates tags and refetches", async () => {
  const { api, store } = setup();
  const sub = store.dispatch(api.endpoints.listTodos.initiate({ ownerId: 1n }));
  await sub;

  await store.dispatch(api.endpoints.createTodo.initiate({ title: "b" }));
  await vi.waitFor(() => {
    const data = api.endpoints.listTodos.select({ ownerId: 1n })(store.getState()).data;
    expect(data?.todos.map((t) => t.title)).toEqual(["a", "b"]);
  });
  sub.unsubscribe();
});

test("ConnectError becomes a serializable RpcError", async () => {
  const { api, store } = setup();
  const res = await store.dispatch(api.endpoints.listTodos.initiate({ ownerId: 404n }));
  expect(res.error).toEqual({ code: Code.NotFound, codeName: "NotFound", message: "no such owner", details: [] });
});

test("generated React hooks are typed from the proto", () => {
  const { api } = setup();
  // Type-level only: never rendered.
  function useTodos() {
    api.useListTodosQuery();
    // @ts-expect-error ownerId is int64
    api.useListTodosQuery({ ownerId: 1 });
    const { data, error } = api.useListTodosQuery({ ownerId: 1n });
    expectTypeOf(data?.todos[0]?.title).toEqualTypeOf<string | undefined>();
    if (error && "codeName" in error) expectTypeOf(error.code).toEqualTypeOf<Code>();
  }
  expect(useTodos).toBeTypeOf("function");
});
