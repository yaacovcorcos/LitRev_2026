import type { RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";
import { RuntimeThreadContext } from "@/lib/server/chat-runtime/thread";

export type RuntimeDispatchContext<T extends RuntimeStreamEvent = RuntimeStreamEvent> = {
  event: T;
  thread: RuntimeThreadContext;
};

export type RuntimeHandler<T extends RuntimeStreamEvent["type"]> = (
  ctx: RuntimeDispatchContext<Extract<RuntimeStreamEvent, { type: T }>>
) => void | Promise<void>;

export type RuntimeMiddleware = (
  ctx: RuntimeDispatchContext,
  next: () => Promise<void>
) => void | Promise<void>;

type RuntimeAnyHandler = (ctx: RuntimeDispatchContext) => void | Promise<void>;

export class ChatRuntime {
  private middlewares: RuntimeMiddleware[] = [];
  private handlers = new Map<RuntimeStreamEvent["type"], RuntimeAnyHandler[]>();

  use(middleware: RuntimeMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  on<T extends RuntimeStreamEvent["type"]>(type: T, handler: RuntimeHandler<T>): this {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler as RuntimeAnyHandler]);
    return this;
  }

  async dispatch(event: RuntimeStreamEvent, thread: RuntimeThreadContext): Promise<void> {
    const ctx: RuntimeDispatchContext = { event, thread };
    const handlers = this.handlers.get(event.type) ?? [];

    let middlewareIdx = -1;
    const runMiddleware = async (idx: number): Promise<void> => {
      if (idx <= middlewareIdx) {
        throw new Error("next() called multiple times");
      }
      middlewareIdx = idx;
      const middleware = this.middlewares[idx];
      if (middleware) {
        await middleware(ctx, () => runMiddleware(idx + 1));
        return;
      }
      for (const handler of handlers) {
        await handler(ctx);
      }
    };

    await runMiddleware(0);
  }
}
