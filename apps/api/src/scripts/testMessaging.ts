import dotenv from "dotenv";
import { getMessagingConfigStatus, sendEmail, sendSms } from "../utils/messaging";

dotenv.config();

async function main() {
  const testEmail = process.env.TEST_EMAIL || "";
  const testPhone = process.env.TEST_PHONE || "";
  const status = getMessagingConfigStatus();

  console.log("EduPay messaging configuration:");
  console.log(JSON.stringify(status, null, 2));

  if (!testEmail && !testPhone) {
    console.log("Set TEST_EMAIL and/or TEST_PHONE to send a real test message.");
    return;
  }

  if (testEmail) {
    const emailStatus = await sendEmail({
      to: testEmail,
      subject: "Test EduPay KCS",
      text: [
        "Bonjour,",
        "",
        "Ceci est un test de notification EduPay.",
        "Si vous recevez ce message, la configuration e-mail fonctionne correctement.",
        "",
        "EduPay KCS"
      ].join("\n")
    });
    console.log(`Email test status: ${emailStatus}`);
  }

  if (testPhone) {
    const smsStatus = await sendSms({
      to: testPhone,
      text: "EduPay KCS: test SMS reussi. Les notifications SMS sont configurees."
    });
    console.log(`SMS test status: ${smsStatus}`);
  }
}

main().catch((error) => {
  console.error("Messaging test failed", error);
  process.exit(1);
});
