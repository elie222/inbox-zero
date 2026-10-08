export const GMAIL_DRAFT_FIXTURE = `<div dir="ltr">Thanks for the update.<div><br></div><div>Talk soon.</div><span class="gmail_signature_prefix">-- </span><br><div class="gmail_signature"><table role="presentation"><tbody><tr><td><strong>Example Person</strong></td></tr><tr><td>Example Company</td></tr></tbody></table></div></div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Mon, 10 Aug 2026, Sender wrote:<br></div><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex"><table role="presentation"><tbody><tr><td>Original table content</td></tr></tbody></table></blockquote></div>`;

export const OUTLOOK_DRAFT_FIXTURE = `<div dir="rtl"><p>תודה על העדכון</p></div><div id="Signature"><table role="presentation"><tbody><tr><td>Example Person</td></tr></tbody></table></div><br><div id="divRplyFwdMsg" style="border-top:1px solid #e1e1e1;padding-top:10px"><div><strong>From:</strong> Sender</div><table role="presentation"><tbody><tr><td>Original Outlook table</td></tr></tbody></table></div>`;

export const RTL_EDITABLE_FIXTURE = `<div dir="rtl">שלום <b>עולם</b><div><br></div><div><i>שורה שנייה</i></div></div>`;

// Signature shapes common in provider drafts, with placeholder content.
export const SIGNATURE_FIXTURES = {
  tableWithLogo: `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse"><tbody><tr><td valign="top" style="padding-right:12px"><img src="https://assets.example.com/logo.png" width="64" height="64" alt="Example Company"></td><td valign="top" style="font-family:Arial,sans-serif;font-size:13px;color:#333333"><b>Example Person</b><br>Head of Examples<br><a href="https://example.com">example.com</a></td></tr></tbody></table>`,
  styledBlocks: `<div style="font-family:Georgia,serif;color:#1f2937"><div style="font-size:15px;font-weight:600">Example Person</div><div style="font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:4px;margin-top:4px">Example Company · <a href="mailto:person@example.com">person@example.com</a></div></div>`,
  outlookMso: `<p class="MsoNormal"><span style="font-size:11.0pt;font-family:&quot;Calibri&quot;,sans-serif;color:#1F497D">Example Person<o:p></o:p></span></p><p class="MsoNormal"><span style="font-size:9.0pt;color:gray">Example Company | +1 555 0100<o:p></o:p></span></p>`,
  fontTags: `<font face="Verdana" size="2" color="#336699">Example Person</font><br><font size="1">Sent from a desk</font>`,
  rtl: `<div dir="rtl" style="text-align:right"><b>אדם לדוגמה</b><br>חברה לדוגמה</div>`,
  centered: `<center><img src="cid:logo@example" alt="Logo"><br><small>Example Company</small></center>`,
} as const;

// Active-content payloads every way into or out of the editor must neutralise.
export const SANITIZER_ATTACK_FIXTURES = [
  '<img src="x" onerror="alert(1)">',
  '<img src="https://example.com/a.png" onload="alert(1)">',
  '<a href="javascript:alert(1)">x</a>',
  '<a href=" JaVaScRiPt:alert(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  "<script>alert(1)</script>",
  "<svg><script>alert(1)</script></svg>",
  "<svg onload=alert(1)></svg>",
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<iframe src="https://example.com"></iframe>',
  '<object data="https://example.com/x.swf"></object>',
  '<embed src="https://example.com/x.swf">',
  '<form action="https://example.com"><input name="q"><button>go</button></form>',
  '<meta http-equiv="refresh" content="0;url=https://example.com">',
  '<base href="https://evil.example/">',
  '<link rel="stylesheet" href="https://example.com/x.css">',
  "<style>body{background:url(https://example.com/track)}</style>",
  '<div style="background:url(https://example.com/track)">x</div>',
  '<div style="background-image:url(&quot;https://example.com/track&quot;)">x</div>',
  '<div style="width:expression(alert(1))">x</div>',
  '<div style="background:u\\72l(https://example.com/track)">x</div>',
  '<div style="-moz-binding:url(https://example.com/x.xml#x)">x</div>',
  '<div style="position:fixed;top:0;left:0">x</div>',
  '<img srcset="https://example.com/a.png 1x" src="cid:a@example">',
  '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  "<template><img src=x onerror=alert(1)></template>",
  '<div data-smartmail="javascript:alert(1)">x</div>',
  '<div id="__next" class="evil">x</div>',
  "<!--<img src=x onerror=alert(1)>-->",
  '<table background="https://example.com/track"><tr><td background="https://example.com/track">x</td></tr></table>',
  '<a href="https://example.com" target="_self" rel="opener">x</a>',
  '<font face="x;color:expression(alert(1))">x</font>',
  '<td bgcolor="red;background:url(x)">x</td>',
];
