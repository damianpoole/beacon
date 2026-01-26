import { describe, expect, it, vi } from "vitest";
import { createPollingController } from "../src/renderer/polling-controller.js";

describe("createPollingController", () => {
  it("avoids overlapping ticks", async () => {
    let resolveTick: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolveTick = resolve;
    });
    const handler = vi.fn(() => pending);
    const controller = createPollingController(handler);

    const first = controller.trigger();
    const second = controller.trigger();

    expect(handler).toHaveBeenCalledTimes(1);
    resolveTick();
    await Promise.all([first, second]);

    await controller.trigger();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("calls latest handler", async () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const controller = createPollingController(firstHandler);

    await controller.trigger();
    controller.setHandler(secondHandler);
    await controller.trigger();

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });
});
