# Supabase Email Setup

Go to Supabase Dashboard → Authentication → Email Templates.

**Do not use `{{ .ConfirmationURL }}`.** That link goes to `*.supabase.co/auth/v1/verify` and comes back with a PKCE `code`, which requires a `code_verifier` cookie on the original signup origin. LaundroCFO confirms email with `token_hash` + `verifyOtp` on `/auth/confirm` instead.

`emailRedirectTo` from the app is `https://<origin>/auth/confirm`. In the templates below that value is `{{ .RedirectTo }}` and is passed as `next`. `type=signup` lives on the template href so the query string stays valid.

---

## Confirm signup — paste this entire body

Subject: Confirm your email to activate your LaundroCFO account

```html
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
      <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}" class="btn">Activate My Account →</a>
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
```

The href that matters:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}
```

---

## Magic Link — yes, same fix (paste if that template still uses ConfirmationURL)

The app does not currently send magic-link sign-in, but the dashboard default template uses `{{ .ConfirmationURL }}` and will hit the same PKCE failure if you ever enable it. Replace the button href with:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}
```

Full body to paste:

```html
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
      <div class="title">Your sign-in link</div>
      <div class="text">
        Click below to sign in to LaundroCFO. This link expires shortly and can only be used once.
      </div>
      <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}" class="btn">Sign in →</a>
      <div class="text" style="margin-top: 24px; font-size: 13px; color: #94a3b8;">
        If you did not request this email, you can safely ignore it.
      </div>
    </div>
    <div class="footer">
      LaundroCFO · The Financial Operating System for Laundromats
    </div>
  </div>
</body>
</html>
```

---

## Invite user — yes, same fix (paste if that template still uses ConfirmationURL)

The app does not currently send invites, but the default Invite template has the same PKCE problem. Replace the button href with:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}
```

Full body to paste:

```html
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
      <div class="title">You've been invited</div>
      <div class="text">
        You've been invited to create a LaundroCFO account. Click below to accept.
      </div>
      <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}" class="btn">Accept invitation →</a>
      <div class="text" style="margin-top: 24px; font-size: 13px; color: #94a3b8;">
        If you were not expecting this invitation, you can safely ignore this email.
      </div>
    </div>
    <div class="footer">
      LaundroCFO · The Financial Operating System for Laundromats
    </div>
  </div>
</body>
</html>
```

---

## Password reset — same fix (live flow)

Subject: Reset your LaundroCFO password

Button href:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

Full body to paste (same styling as confirm signup):

```html
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
      <div class="title">Reset your password</div>
      <div class="text">
        We received a request to reset your LaundroCFO password. Click below to choose a new one.
      </div>
      <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password" class="btn">Reset password →</a>
      <div class="text" style="margin-top: 24px; font-size: 13px; color: #94a3b8;">
        If you did not request a password reset, you can safely ignore this email.
      </div>
    </div>
    <div class="footer">
      LaundroCFO · The Financial Operating System for Laundromats<br>
      This link expires in 24 hours.
    </div>
  </div>
</body>
</html>
```

---

## Site URL Setting

Go to Supabase → Authentication → URL Configuration

Set Site URL to: `https://www.laundrocfo.com`

Add redirect URLs:

```
https://www.laundrocfo.com/**
https://laundrocfo.com/**
https://www.laundrocfo.com/auth/confirm
https://www.laundrocfo.com/auth/callback
https://laundrocfo.com/auth/confirm
https://laundrocfo.com/auth/callback
```
