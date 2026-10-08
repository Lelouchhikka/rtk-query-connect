import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { configureStore } from "@reduxjs/toolkit";
import { createApi } from "@reduxjs/toolkit/query/react";
import { connectBaseQuery, isConnectSerializable, rpcMutation, rpcQuery } from "rtk-query-connect";
import { TodoSchema, TodoService } from "./gen/todo_pb";

// In-memory Connect server so the demo runs without a backend.
// In a real app: createConnectTransport({ baseUrl }) from @connectrpc/connect-web.
const todos = [
  create(TodoSchema, { id: 1n, ownerId: 1n, title: "Write the proto" }),
  create(TodoSchema, { id: 2n, ownerId: 1n, title: "buf generate" }),
  create(TodoSchema, { id: 3n, ownerId: 2n, title: "Ship it" }),
];
const delay = () => new Promise((r) => setTimeout(r, 400));

const transport = createRouterTransport(({ service }) =>
  service(TodoService, {
    async listTodos({ ownerId }) {
      await delay();
      if (ownerId === 404n) throw new ConnectError("owner not found", Code.NotFound);
      return { todos: todos.filter((t) => t.ownerId === ownerId) };
    },
    async createTodo({ ownerId, title }) {
      await delay();
      if (!title.trim()) throw new ConnectError("title is required", Code.InvalidArgument);
      const todo = create(TodoSchema, { id: BigInt(todos.length + 1), ownerId, title });
      todos.push(todo);
      return { todo };
    },
  }),
);

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
  middleware: (gDM) => gDM({ serializableCheck: { isSerializable: isConnectSerializable } }).concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
