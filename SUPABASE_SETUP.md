# Supabase Email Setup

Go to Supabase Dashboard → Authentication → Email Templates

## Confirm Signup Template
Subject: Confirm your email to activate your LaundroCFO account

Body:
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f5f7fa; margin: 0; padding: 40px 20px; }
    .container { max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #0f1e3d; padding: 32px 40px; }
    .logo { color: #60a5fa; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .body { padding: 40px; }
    .title { font-size: 22px; font-weight: 700; color: #1e293b; margin-bottom: 16px; }
    .text { font-size: 15px; color: #475569; line-height: 1.7; margin-bottom: 24px; }
    .btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; }
    .footer { padding: 24px 40px; background: #f8fafc; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">LaundroCFO</div>
    </div>
    <div class="body">
      <div class="title">Confirm your email address</div>
      <div class="text">
        Welcome to LaundroCFO — the valuation and underwriting platform built for laundromat owners, buyers, brokers, and lenders.<br><br>
        Click below to activate your account and begin managing your store's financial performance, valuation, equipment, insurance, and lending readiness.
      </div>
      <a href="{{ .ConfirmationURL }}" class="btn">Activate My Account →</a>
      <div class="text" style="margin-top: 24px; font-size: 13px; color: #94a3b8;">
        If you did not create a LaundroCFO account, you can safely ignore this email.
      </div>
    </div>
    <div class="footer">
      LaundroCFO · The Financial Operating System for Laundromats<br>
      This link expires in 24 hours.
    </div>
  </div>
</body>
</html>

## Site URL Setting
Go to Supabase → Authentication → URL Configuration
Set Site URL to: https://www.laundrocfo.com
Add redirect URLs:
https://www.laundrocfo.com/**
https://laundrocfo.com/**

## Password Reset Template  
Subject: Reset your LaundroCFO password
Use same styling as above but with reset password message and {{ .ConfirmationURL }} button.
