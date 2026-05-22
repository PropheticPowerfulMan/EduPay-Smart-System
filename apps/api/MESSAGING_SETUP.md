# EduPay Messaging Setup

EduPay can send real e-mails through SMTP and real SMS through Africa's Talking, or through a compatible HTTP SMS gateway.

## E-mail

Set these variables in `apps/api/.env` on the deployed server:

```env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_FROM="Kinshasa Christian School <noreply@your-domain.com>"
SMTP_PASS=your-real-smtp-password
```

Use port `465` only if the provider requires SSL from the start. Use `587` for the common TLS upgrade flow.

## SMS

For Africa's Talking:

```env
AFRIKTALK_API_URL=https://api.africastalking.com/version1/messaging
AFRIKTALK_USERNAME=your-africastalking-username
AFRIKTALK_API_KEY=your-real-api-key
AFRIKTALK_SENDER=EduPay
```

Phone numbers should be saved in international format, for example `+243...`.

## Test

After setting the real credentials:

```bash
cd apps/api
TEST_EMAIL=parent@example.com TEST_PHONE=+243000000000 npm run test:messaging
```

Expected real statuses:

- `SENT`: the provider accepted the message.
- `FAILED`: credentials, sender name, phone number, network, or provider response failed.
- `SIMULATED`: credentials are still missing or set to `CHANGE_ME`.
- `SKIPPED`: no recipient was provided.

The API also exposes `GET /api/notifications/status` for admins/accountants to verify whether e-mail and SMS are configured.
