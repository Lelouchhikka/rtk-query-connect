import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import type { RpcError } from "rtk-query-connect";
import { store, useCreateTodoMutation, useListTodosQuery, type RootState } from "./api";

const owners = [1n, 2n, 404n];

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as RpcError;
  return <p className="error">{e.codeName}: {e.message}</p>;
}

function Todos({ ownerId }: { ownerId: bigint }) {
  const { currentData: data, error, isFetching } = useListTodosQuery({ ownerId });
  const [createTodo, created] = useCreateTodoMutation();
  const [title, setTitle] = useState("");

  return (
    <section>
      <h2>Todos of owner {String(ownerId)} {isFetching && "…"}</h2>
      <ErrorText error={error} />
      <ul>{data?.todos.map((t) => <li key={String(t.id)}>#{String(t.id)} {t.title}</li>)}</ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createTodo({ ownerId, title }).unwrap().then(() => setTitle(""), () => {});
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New todo" />
        <button disabled={created.isLoading}>Add</button>
      </form>
      <ErrorText error={created.error} />
    </section>
  );
}

function CacheKeys() {
  const keys = Object.keys(useSelector((s: RootState) => s.api.queries));
  return (
    <section>
      <h2>RTK Query cache keys</h2>
      <pre>{keys.join("\n") || "(empty)"}</pre>
    </section>
  );
}

function App() {
  const [ownerId, setOwnerId] = useState(owners[0]!);
  return (
    <>
      <h1>rtk-query-connect</h1>
      <p>
        Typed RTK Query hooks for a ConnectRPC service. <code>ownerId</code> is an <code>int64</code> (bigint); pick
        owner 404 to see a <code>ConnectError</code>.
      </p>
      {owners.map((id) => (
        <button key={String(id)} onClick={() => setOwnerId(id)} disabled={id === ownerId}>
          owner {String(id)}
        </button>
      ))}
      <Todos ownerId={ownerId} />
      <CacheKeys />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <App />
  </Provider>,
);
