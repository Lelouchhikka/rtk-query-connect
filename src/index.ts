import { create, isMessage, toJsonString } from "@bufbuild/protobuf";
import type { DescMessage, DescMethodUnary, MessageInitShape, MessageShape } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { Transport } from "@connectrpc/connect";
import { isPlain } from "@reduxjs/toolkit";
import type { BaseQueryFn, EndpointBuilder, MutationExtraOptions, QueryExtraOptions } from "@reduxjs/toolkit/query";

export interface RpcArgs {
  method: DescMethodUnary<DescMessage, DescMessage>;
  input: unknown;
}

export interface RpcError {
  code: Code;
  codeName: keyof typeof Code;
  message: string;
  /** Raw error details; decode with `fromBinary(Schema, detail.value)`. */
  details: { type: string; value: Uint8Array }[];
}

export type ConnectBaseQuery = BaseQueryFn<RpcArgs, unknown, RpcError>;

/** A `baseQuery` that runs unary RPCs over a Connect transport. */
export function connectBaseQuery({ transport }: { transport: Transport }): ConnectBaseQuery {
  return async ({ method, input }, { signal }) => {
    try {
      const res = await transport.unary(method, signal, undefined, undefined, input as MessageInitShape<DescMessage>);
      return { data: res.message };
    } catch (e) {
      const err = ConnectError.from(e);
      return {
        error: {
          code: err.code,
          codeName: Code[err.code] as keyof typeof Code,
          message: err.rawMessage,
          details: err.details.flatMap((d) => ("type" in d ? [{ type: d.type, value: d.value }] : [])),
        },
      };
    }
  };
}

type AnyBaseQuery = BaseQueryFn<RpcArgs, any, any, any, any>;
// `void` lets requests with no required fields be called as `useListThingsQuery()`.
type Input<I extends DescMessage> = MessageInitShape<I> | void;

/** Turns a unary RPC into a typed RTK Query `query` endpoint. */
export function rpcQuery<BQ extends AnyBaseQuery, Tags extends string, Path extends string, I extends DescMessage, O extends DescMessage>(
  build: EndpointBuilder<BQ, Tags, Path>,
  method: DescMethodUnary<I, O>,
  options?: Omit<QueryExtraOptions<Tags, MessageShape<O>, Input<I>, BQ, Path>, "type">,
) {
  return build.query<MessageShape<O>, Input<I>>({
    query: (input) => ({ method, input }),
    // Default key uses JSON.stringify, which throws on int64 (bigint) fields.
    serializeQueryArgs: ({ endpointName, queryArgs }) =>
      `${endpointName}(${toJsonString(method.input, create(method.input, queryArgs || undefined))})`,
    ...options,
  } as Parameters<typeof build.query<MessageShape<O>, Input<I>>>[0]);
}

/** Turns a unary RPC into a typed RTK Query `mutation` endpoint. */
export function rpcMutation<BQ extends AnyBaseQuery, Tags extends string, Path extends string, I extends DescMessage, O extends DescMessage>(
  build: EndpointBuilder<BQ, Tags, Path>,
  method: DescMethodUnary<I, O>,
  options?: Omit<MutationExtraOptions<Tags, MessageShape<O>, Input<I>, BQ, Path>, "type">,
) {
  return build.mutation<MessageShape<O>, Input<I>>({
    query: (input) => ({ method, input }),
    ...options,
  } as Parameters<typeof build.mutation<MessageShape<O>, Input<I>>>[0]);
}

/**
 * `isSerializable` for RTK's serializableCheck middleware that accepts
 * protobuf messages, int64 (bigint) and bytes (Uint8Array) fields.
 */
export function isConnectSerializable(value: unknown): boolean {
  return isPlain(value) || isMessage(value) || typeof value === "bigint" || value instanceof Uint8Array;
}
