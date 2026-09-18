/*
  Emulator acceptance helper.
  Set TEST_FUNCTION_URL, TEST_ID_TOKEN, TEST_APP_CHECK_TOKEN and TEST_QR, then run:
  node tests/checkin-concurrency.mjs
*/
const endpoint = process.env.TEST_FUNCTION_URL;
const token = process.env.TEST_ID_TOKEN;
const appCheckToken = process.env.TEST_APP_CHECK_TOKEN;
const qrPayload = process.env.TEST_QR;
if (!endpoint || !token || !appCheckToken || !qrPayload) {
  console.error("Set TEST_FUNCTION_URL, TEST_ID_TOKEN, TEST_APP_CHECK_TOKEN and TEST_QR first.");
  process.exit(1);
}

const attempts = Array.from({ length: 20 }, (_, index) => fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "X-Firebase-AppCheck": appCheckToken },
  body: JSON.stringify({ data: { qrPayload, requestId: crypto.randomUUID() } })
}).then((response) => response.json()));

const results = await Promise.all(attempts);
const statuses = results.map((item) => item.result?.status || item.error?.status || "error");
const successes = statuses.filter((status) => status === "success").length;
const already = statuses.filter((status) => status === "already").length;
console.log({ statuses, successes, already });
if (successes !== 1 || already !== 19) process.exit(2);
