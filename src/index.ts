import {
  KMSClient,
  GenerateMacCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";

import { writeFileSync, readFileSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import { createHmac } from "node:crypto";

const execAsync = promisify(exec);

const REGION = "eu-west-1";
const KEY_ID = "alias/test-imported-hashing-key";

const crossAccountID = "619071313045";

const crossAccountKeyID = "mrk-d9fb88da57e743cb9d26cb6ca4acd8dc";

const hashraw =
  "d1cf9999634ea26943df2d6cc8a6da9cb5a6de0ea7b79be7fb68a46a1d0c28d97891e4839bd2582c3559d59341fae8842e4d0ce782bd5007285f3a5a9b8309af";

const hashingKey_512 = Buffer.from(hashraw, "hex");

const crossAccountKeyAlias = "collies-usecase";

const CROSSS_ACCOUNT_REGION = "ap-south-1";

export const handler = async (event: any): Promise<any> => {
  // I will use this lambda for my father's work about handling electric bills
  console.log({ event: JSON.stringify(event, null, 2), msg: "Event received" });
  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const base64Pdf = body?.base64Pdf;

    if (base64Pdf) {
      console.log({ base64Pdf });
      // Decode base64
      const pdfBuffer = Buffer.from(base64Pdf, "base64");

      const text = await extractText(pdfBuffer);
      const billData = parseBill(text);

      if (!billData.month || !billData.year) {
        return {
          statusCode: 422,
          body: JSON.stringify({ error: "Could not extract Billing Cycle" })
        };
      }

      console.log({ billData });

      return {
        statusCode: 200,
        body: JSON.stringify(billData)
      };
    }

    const message = body?.message;
    const encryptedData = body?.encryptedData;
    const crossAccount = body?.crossAccount;
    const callKMS = body?.callKMS;
    const partner = body?.partner;

    if (encryptedData) {
      console.log({ encryptedData, partner });

      const ciphertextBuffer = Buffer.from(encryptedData, "base64");

      const command = new DecryptCommand({
        KeyId: `alias/${partner}`,
        CiphertextBlob: ciphertextBuffer,
        EncryptionAlgorithm: "RSAES_OAEP_SHA_256",
      });

      const kmsClient = new KMSClient({ region: REGION });

      const response = await kmsClient.send(command);

      return {
        statusCode: 200,
        body: JSON.stringify({
          mac: Buffer.from(response.Plaintext as Uint8Array).toString("utf-8"),
        }),
      };
    }

    if (message) {
      console.log({ message, crossAccount });

      let kmsClient: KMSClient;

      if (!crossAccount) {
        if (callKMS) {
          console.log("will call KMS");
          kmsClient = new KMSClient({ region: REGION });
          const command = new GenerateMacCommand({
            KeyId: KEY_ID,
            MacAlgorithm: "HMAC_SHA_512",
            Message: Buffer.from(message, "utf-8"),
          });

          const response = await kmsClient.send(command);

          return {
            statusCode: 200,
            body: JSON.stringify({
              mac: Buffer.from(response.Mac as Uint8Array).toString("hex"),
            }),
          };
        } else {
          const hmac = createHmac("sha512", hashingKey_512);
          hmac.update(Buffer.from(message, "utf-8"));
          const mac = hmac.digest("hex");
          return {
            statusCode: 200,
            body: JSON.stringify({
              key: mac,
            }),
          };
        }
      } else {
        kmsClient = new KMSClient({
          region: CROSSS_ACCOUNT_REGION,
        });

        const command = new GenerateMacCommand({
          KeyId: `arn:aws:kms:${CROSSS_ACCOUNT_REGION}:${crossAccountID}:alias/${crossAccountKeyAlias}`,
          MacAlgorithm: "HMAC_SHA_512",
          Message: Buffer.from(message),
        });

        const response = await kmsClient.send(command);

        return {
          statusCode: 200,
          body: JSON.stringify({
            mac: Buffer.from(response.Mac as Uint8Array).toString("hex"),
          }),
        };
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: `Missing 'message' or 'encryptedData' in request body.`,
      }),
    };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message ?? "Internal Server Error" }),
    };
  }
};

export interface ParsedBill {
  month?: string;
  year?: string;
  billingDate?: string;
  dueDate?: string;
  unitsConsumed?: string;
  billBeforeDueNEFT?: string;
  billAfterDueDate?: string;
  billBeforeDue?: string;
}

export function parseBill(text: string): ParsedBill {
  const result: ParsedBill = {};

  if (!text || typeof text !== "string") {
    return result;
  }

  // ===============================
  // Billing Cycle
  // ===============================
  const cycleMatch = text.match(
    /Billing\s*Cycle\s*:?\s*([A-Z]{3})\s*,?\s*(\d{4})/i
  );

  if (cycleMatch) {
    result.month = cycleMatch[1].toUpperCase();
    result.year = cycleMatch[2];
  }

  // ===============================
  // Billing Date
  // ===============================
  const billDateMatch = text.match(
    /Billing\s*Date\s*:?\s*(\d{2}[.\-/]\d{2}[.\-/]\d{4})/i
  );

  if (billDateMatch) {
    result.billingDate = billDateMatch[1];
  }

  // ===============================
  // Due Date
  // ===============================
  const dueDateMatch = text.match(
    /Due\s*Date\s*:?\s*(\d{2}[.\-/]\d{2}[.\-/]\d{4})/i
  );

  if (dueDateMatch) {
    result.dueDate = dueDateMatch[1];
  }

  // ===============================
  // Units Consumed
  // ===============================
  const unitsMatch = text.match(
    /Chargeable\s*KWH\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i
  );

  if (unitsMatch) {
    const totalUnits =
      parseFloat(unitsMatch[1]) +
      parseFloat(unitsMatch[2]) +
      parseFloat(unitsMatch[3]);

    result.unitsConsumed = totalUnits.toFixed(2);
  }

  // ===============================
  // Bill Before Due
  // ===============================
  const billBeforeDue = text.match(
    /Payable\s*by\s*Due\s*Date\(Rs\)\s*:?\s*([\d,]+\.\d{2})/i
  );

  if (billBeforeDue) {
    result.billBeforeDue = billBeforeDue[1].replace(/,/g, "");
  }

  // ===============================
  // Bill Before Due (NEFT/RTGS)
  // ===============================
  const neftMatch = text.match(
    /Through\s*NEFT\/RTGS\(RS\)\s*:?\s*([\d,]+\.\d{2})/i
  );

  if (neftMatch) {
    result.billBeforeDueNEFT = neftMatch[1].replace(/,/g, "");
  }

  // ===============================
  // Bill After Due Date
  // ===============================
  const afterDueMatch = text.match(
    /Payable\s*After\s*Due\s*Date\(Rs\)\s*:?\s*([\d,]+\.\d{2})/i
  );

  if (afterDueMatch) {
    result.billAfterDueDate = afterDueMatch[1].replace(/,/g, "");
  }

  return result;
}

async function extractText(buffer: Buffer): Promise<string> {
  const inputPath = "/tmp/input.pdf";
  const outputPath = "/tmp/output.txt";

  writeFileSync(inputPath, buffer);

  // Use the absolute path provided by the layer
  try {
    await execAsync(`/opt/bin/pdftotext -layout ${inputPath} ${outputPath}`);
  } catch (e) {
    // If /opt/bin fails, try the global path as a backup
    await execAsync(`pdftotext -layout ${inputPath} ${outputPath}`);
  }

  return readFileSync(outputPath, "utf-8");
}
