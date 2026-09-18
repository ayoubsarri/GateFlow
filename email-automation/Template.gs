function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function invitationSubject_() {
  return 'دعوتكم الخاصة من INAS';
}

function programRows_() {
  return [
    ['09:30 - 10:00', 'الجلسة الافتتاحية', [
      'كلمة إيناس وإعلان الافتتاح الرسمي',
      'كلمة المعهد العالي للعلوم',
      'كلمة شبكة النخبة'
    ]],
    ['09:00 - 12:00', 'الجلسة العلمية', [
      'تجارب تطبيق ISO 9001 وآفاق تطوير أنظمة ضمان الجودة',
      'تحديات إرساء نظام الجودة ISO 9001 إصدار 2015',
      'المواصفات الدولية ISO 9001 في مؤسسات التعليم العالي'
    ]],
    ['11:40 - 12:15', 'استراحة تشبيك', ['فترة التعقيبات والنقاش']],
    ['14:30 - 14:45', 'اختتام وتكريم الضيوف', []],
    ['15:00', 'استراحة غداء', []]
  ];
}

function programPlainText_() {
  const lines = ['برنامج اليوم'];
  programRows_().forEach(function(row) {
    lines.push(row[0] + ' - ' + row[1]);
    row[2].forEach(function(item) { lines.push('• ' + item); });
  });
  return lines.join('\n');
}

function programHtml_() {
  return programRows_().map(function(row) {
    const items = row[2].map(function(item) {
      return '<li style="margin:0 0 5px;">' + escapeHtml_(item) + '</li>';
    }).join('');
    return '<tr>' +
      '<td dir="ltr" width="105" valign="top" style="padding:10px 8px;color:#ffffff;background:#0b4543;border-radius:9px;text-align:center;font-size:12px;font-weight:bold;">' + escapeHtml_(row[0]) + '</td>' +
      '<td valign="top" style="padding:9px 0 13px 12px;text-align:right;border-bottom:1px solid #e6eeeb;">' +
      '<div style="font-size:14px;font-weight:bold;color:#0c3033;">' + escapeHtml_(row[1]) + '</div>' +
      (items ? '<ul style="margin:7px 0 0;padding:0 18px 0 0;color:#516967;font-size:12px;line-height:1.65;">' + items + '</ul>' : '') +
      '</td></tr>';
  }).join('');
}

function invitationPlainText_(asset) {
  const confirmUrl = confirmationUrl_(asset);
  return [
    'دعوة خاصة من INAS',
    asset.name,
    '',
    'يرجى إبراز رمز QR عند الدخول.',
    'الرمز اليدوي: ' + asset.manualCode,
    'تأكيد الحضور: ' + confirmUrl,
    'هذا الرمز شخصي، يرجى عدم مشاركته.',
    '',
    programPlainText_(),
    '',
    'Your personal INAS invitation',
    'Please show the QR code at the entrance.',
    'Manual code: ' + asset.manualCode,
    'Confirm attendance: ' + confirmUrl,
    'This ticket is personal. Please do not share it.'
  ].join('\n');
}

function buildInvitationHtml_(asset) {
  const name = escapeHtml_(asset.name);
  const code = escapeHtml_(asset.manualCode);
  const confirmUrl = escapeHtml_(confirmationUrl_(asset));
  return '<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;padding:0;background:#eef4f2;font-family:Tahoma,Arial,sans-serif;color:#103b3b;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:18px 8px;">' +
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border-radius:22px;overflow:hidden;border:1px solid #d8e4e0;">' +
    '<tr><td style="height:6px;background:linear-gradient(90deg,#0b4543,#e2af24);font-size:0;">&nbsp;</td></tr>' +
    '<tr><td align="center" style="padding:24px 22px 18px;"><img src="cid:inasLogo" width="250" alt="INAS" style="display:block;width:100%;max-width:250px;height:auto;border:0;"></td></tr>' +
    '<tr><td align="center" style="padding:24px 22px;background:#0b4543;color:#fff;">' +
    '<div style="font-size:13px;color:#d9b947;font-weight:bold;">دعوة خاصة</div>' +
    '<h1 style="margin:10px 0 0;font-size:27px;line-height:1.45;color:#fff;">' + name + '</h1>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:24px 22px 8px;"><p style="margin:0;font-size:17px;line-height:1.8;">يرجى إبراز هذا الرمز عند الدخول</p></td></tr>' +
    '<tr><td align="center" style="padding:10px 22px 20px;"><div style="display:inline-block;padding:12px;background:#fff;border:3px solid #e2af24;border-radius:16px;"><img src="cid:ticketQr" width="220" height="220" alt="QR" style="display:block;width:220px;height:220px;border:0;"></div></td></tr>' +
    '<tr><td align="center" style="padding:0 22px 18px;"><div style="font-size:12px;color:#637a77;">الرمز اليدوي</div><div dir="ltr" style="display:inline-block;margin-top:8px;padding:11px 18px;background:#f3f7f5;border-radius:10px;font-family:Consolas,monospace;font-size:18px;font-weight:bold;letter-spacing:2px;color:#103b3b;">' + code + '</div></td></tr>' +
    '<tr><td align="center" style="padding:0 22px 28px;"><a href="' + confirmUrl + '" target="_blank" style="display:inline-block;background:#e2af24;color:#0b4543;text-decoration:none;border-radius:999px;padding:13px 28px;font-size:16px;font-weight:bold;">تأكيد الحضور</a><div dir="ltr" style="margin-top:7px;color:#637a77;font-size:12px;">Confirm attendance</div></td></tr>' +
    '<tr><td style="padding:20px 22px 24px;background:#f7faf9;border-top:1px solid #dce7e3;">' +
    '<h2 style="margin:0 0 14px;color:#0b4543;font-size:21px;text-align:right;">برنامج اليوم</h2>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + programHtml_() + '</table>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:16px 22px;background:#0b4543;color:#c8dad6;font-size:11px;line-height:1.8;">هذا الرمز شخصي، يرجى عدم مشاركته.<br><span dir="ltr">This ticket is personal. Please do not share it.</span></td></tr>' +
    '</table></td></tr></table></body></html>';
}
