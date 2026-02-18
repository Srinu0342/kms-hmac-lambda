import { handler } from "./index";

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-kms", () => ({
  __esModule: true,
  KMSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GenerateMacCommand: jest.fn(),
  DecryptCommand: jest.fn(),
}));

describe("kms-hmac-lambda handler", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test.skip("returns hex mac for a plain message (non-cross-account)", async () => {
    mockSend.mockResolvedValueOnce({ Mac: Uint8Array.from([0x01, 0x02, 0x03]) });

    const event = { body: JSON.stringify({ message: "hello" }) };
    const res = await handler(event);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.mac).toBe("010203");
  });

  test.skip("returns hex mac for a cross-account message", async () => {
    mockSend.mockResolvedValueOnce({ Mac: Uint8Array.from([0x0a, 0x0b]) });

    const event = { body: JSON.stringify({ message: "hi", crossAccount: true }) };
    const res = await handler(event);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.mac).toBe("0a0b");
  });

  test.skip("decrypts encryptedData and returns plaintext as mac", async () => {
    mockSend.mockResolvedValueOnce({ Plaintext: Buffer.from("decrypted-string") });

    const encryptedData = Buffer.from("ignored").toString("base64");
    const event = { body: JSON.stringify({ encryptedData, partner: "somealias" }) };
    const res = await handler(event);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.mac).toBe("decrypted-string");
  });

  test.skip("returns 400 when neither message nor encryptedData provided", async () => {
    const event = { body: JSON.stringify({}) };
    const res = await handler(event);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/Missing 'message' or 'encryptedData'/);
  });

  test.skip("returns 500 when KMS client throws an error", async () => {
    mockSend.mockRejectedValueOnce(new Error("kms failure"));

    const event = { body: JSON.stringify({ message: "fail" }) };
    const res = await handler(event);

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("kms failure");
  });
});
