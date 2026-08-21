import { describe, expect, it } from "vitest";
import { identityStatus } from "./hwid-admin.js";

describe("HWID identity diagnostics", () => {
  it("marks complete identity when username and user id are present", () => {
    expect(identityStatus({ game_username: "ExampleUser", game_user_id: "12345" })).toBe("COMPLETE");
  });

  it("marks partial identity when only one field is present", () => {
    expect(identityStatus({ game_username: "ExampleUser", game_user_id: "" })).toBe("PARTIAL");
    expect(identityStatus({ game_username: "", game_user_id: "12345" })).toBe("PARTIAL");
  });

  it("marks identity as not received when both fields are empty", () => {
    expect(identityStatus({ game_username: "", game_user_id: "" })).toBe("NOT_RECEIVED");
    expect(identityStatus({})).toBe("NOT_RECEIVED");
  });
});
