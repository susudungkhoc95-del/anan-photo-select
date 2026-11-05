import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ pages: [] as Array<{ data: unknown[] | null; error: { message: string } | null }>, calls: [] as Array<Array<[string, ...unknown[]]>> }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => {
    const calls: Array<[string, ...unknown[]]> = [];
    mock.calls.push(calls);
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "not", "or", "order", "range", "limit"]) {
      query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
    }
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(mock.pages.shift()).then(resolve, reject);
    return query;
  } })
}));

import { readAppRecords } from "@/lib/supabase";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  mock.pages = [];
  mock.calls = [];
});

describe("Supabase collection pagination", () => {
  it("reads beyond 1,000 records and preserves filters and deterministic order on every page", async () => {
    const data = Array.from({ length: 1011 }, (_, i) => ({ record_id: String(i) }));
    mock.pages = [data.slice(0, 500), data.slice(500, 1000), data.slice(1000)].map((data) => ({ data, error: null }));
    expect(await readAppRecords("WorkflowActivities", "studio", { payloadIndex: 2, payloadEquals: "card" })).toEqual(data);
    expect(mock.calls.map((calls) => calls.find(([method]) => method === "range"))).toEqual([["range", 0, 499], ["range", 500, 999], ["range", 1000, 1499]]);
    for (const calls of mock.calls) {
      expect(calls).toContainEqual(["eq", "collection", "WorkflowActivities"]);
      expect(calls).toContainEqual(["eq", "workspace_id", "studio"]);
      expect(calls).toContainEqual(["eq", "payload->>2", "card"]);
      expect(calls).toContainEqual(["order", "record_id", { ascending: true }]);
    }
  });

  it("respects an explicit page instead of loading everything", async () => {
    mock.pages = [{ data: [{ record_id: "one" }], error: null }];
    await readAppRecords("WorkflowCards", "studio", { limit: 20, offset: 40 });
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toContainEqual(["range", 40, 59]);
  });

  it("pages completed cards by completion date, with stable creation-date ordering", async () => {
    mock.pages = [{ data: [], error: null }];
    await readAppRecords("WorkflowCards", "studio", { payloadIndex: 2, payloadEquals: "done", nonEmptyPayloadIndex: 12, orderByPayload: 12, secondaryOrderByPayload: 10, ascending: false, limit: 21 });
    const calls = mock.calls[0];
    expect(calls).toContainEqual(["not", "payload->>12", "is", null]);
    expect(calls).toContainEqual(["neq", "payload->>12", ""]);
    expect(calls.filter(([method]) => method === "order")).toEqual([["order", "payload->>12", { ascending: false }], ["order", "payload->>10", { ascending: false }], ["order", "record_id", { ascending: true }]]);
    expect(calls).toContainEqual(["limit", 21]);
  });

  it("includes missing and empty completion dates in the legacy stream", async () => {
    mock.pages = [{ data: [], error: null }];
    await readAppRecords("WorkflowCards", "studio", { emptyPayloadIndex: 12, orderByPayload: 10, ascending: false, limit: 21 });
    expect(mock.calls[0]).toContainEqual(["or", "payload->>12.is.null,payload->>12.eq."]);
    expect(mock.calls[0]).toContainEqual(["order", "payload->>10", { ascending: false }]);
  });

  it("propagates a later page failure instead of returning incomplete history", async () => {
    mock.pages = [{ data: Array(500).fill({}), error: null }, { data: null, error: { message: "unavailable" } }];
    await expect(readAppRecords("WorkflowActivities", "studio")).rejects.toThrow("unavailable");
  });
});
