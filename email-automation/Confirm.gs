function confirmationBaseUrl_() {
  const configured = settings_().confirmation_base_url;
  if (configured) return configured.replace(/\?.*$/, '').replace(/\/$/, '');
  const serviceUrl = ScriptApp.getService().getUrl();
  if (serviceUrl) return serviceUrl.replace(/\?.*$/, '').replace(/\/$/, '');
  return INAS_EMAIL.DEFAULT_CONFIRMATION_BASE_URL;
}

function confirmationUrl_(asset) {
  if (!asset.confirmToken) throw new Error('Confirmation token is missing.');
  return confirmationBaseUrl_() + '?confirm=' + encodeURIComponent(asset.confirmToken);
}

function confirmationPage_(title, message, success) {
  const color = success ? '#0b7450' : '#9a3b36';
  const bg = success ? '#e6f5ec' : '#fff0ee';
  const icon = success ? '✓' : '!';
  const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeHtml_(title) + '</title></head>' +
    '<body style="margin:0;background:#eef4f2;font-family:Tahoma,Arial,sans-serif;color:#0c3033;display:grid;min-height:100vh;place-items:center;padding:18px;">' +
    '<main style="width:min(440px,100%);background:#fff;border:1px solid #dce7e3;border-radius:24px;box-shadow:0 22px 60px rgba(5,47,50,.12);overflow:hidden;text-align:center;">' +
    '<div style="height:7px;background:linear-gradient(90deg,#0b4543,#e2af24);"></div>' +
    '<section style="padding:34px 26px 30px;">' +
    '<div style="width:72px;height:72px;border-radius:22px;background:' + bg + ';color:' + color + ';display:grid;place-items:center;font-size:42px;font-weight:bold;margin:0 auto 18px;">' + icon + '</div>' +
    '<h1 style="margin:0 0 10px;font-size:25px;line-height:1.5;color:#0b4543;">' + escapeHtml_(title) + '</h1>' +
    '<p style="margin:0;color:#5b716f;font-size:15px;line-height:1.8;">' + escapeHtml_(message) + '</p>' +
    '</section>' +
    '<footer style="padding:14px 22px;background:#0b4543;color:#c8dad6;font-size:12px;">INAS</footer>' +
    '</main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function findParticipantByConfirmationToken_(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) throw new Error('invalid-token');
  const context = activeContext_();
  const normalized = String(token).toLowerCase();
  for (let index = 0; index < context.participants.length; index += 1) {
    const participant = context.participants[index];
    if (String(participant.data.ticketHash || '').toLowerCase() === normalized) {
      return { context: context, participant: participant };
    }
  }
  throw new Error('not-found');
}

function confirmAttendance_(token) {
  const match = findParticipantByConfirmationToken_(token);
  const participant = match.participant;
  if (participant.data.status === 'revoked') throw new Error('revoked');

  fsPatchDocument_('events/' + INAS_EMAIL.EVENT_ID + '/rosters/' + match.context.rosterId + '/participants/' + participant.id, {
    confirmationStatus: 'confirmed',
    confirmedAt: new Date(),
    confirmationUpdatedAt: new Date(),
    confirmationNote: 'Email confirmation',
    updatedAt: new Date()
  });

  try {
    appendCampaignLog_('confirm-click', participant.data.email || '', 'confirmed', participant.id);
  } catch (ignored) {
    // Confirmation must not fail just because the spreadsheet log is unavailable.
  }
  return participant;
}

function confirmationPromptPage_(participant, token) {
  const serviceUrl = confirmationBaseUrl_();
  const name = escapeHtml_(participant.data.name || '');
  const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>تأكيد الحضور - INAS</title></head>' +
    '<body style="margin:0;background:#eef4f2;font-family:Tahoma,Arial,sans-serif;color:#0c3033;display:grid;min-height:100vh;place-items:center;padding:18px;">' +
    '<main style="width:min(440px,100%);background:#fff;border:1px solid #dce7e3;border-radius:24px;box-shadow:0 22px 60px rgba(5,47,50,.12);overflow:hidden;text-align:center;">' +
    '<div style="height:7px;background:linear-gradient(90deg,#0b4543,#e2af24);"></div>' +
    '<section style="padding:34px 26px 30px;">' +
    '<h1 style="margin:0 0 10px;font-size:22px;line-height:1.5;color:#0b4543;">مرحباً ' + name + '</h1>' +
    '<p style="margin:0 0 24px;color:#5b716f;font-size:15px;line-height:1.8;">يرجى تأكيد رغبتكم في حضور فعاليات المؤتمر لتثبيت مقعدكم.</p>' +
    '<form method="post" action="' + serviceUrl + '">' +
    '<input type="hidden" name="confirm" value="' + escapeHtml_(token) + '">' +
    '<button type="submit" style="background:#0b7450;color:#fff;border:none;border-radius:12px;padding:14px 28px;font-size:16px;font-weight:bold;cursor:pointer;box-shadow:0 8px 20px rgba(11,116,80,.25);">تأكيد الحضور الآن ✓</button>' +
    '</form>' +
    '</section>' +
    '<footer style="padding:14px 22px;background:#0b4543;color:#c8dad6;font-size:12px;">INAS</footer>' +
    '</main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('تأكيد الحضور - INAS').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleConfirmation_(token) {
  if (!token) return confirmationPage_('رابط غير صحيح', 'لم يتم العثور على رمز التأكيد.', false);
  const participant = confirmAttendance_(token);
  return confirmationPage_('تم تأكيد حضوركم', 'شكراً ' + participant.data.name + '، تم تسجيل التأكيد بنجاح.', true);
}

function handleError_(error) {
  const code = String(error && error.message || error);
  if (code === 'revoked') return confirmationPage_('الدعوة ملغاة', 'لا يمكن تأكيد هذه الدعوة حالياً.', false);
  if (code === 'not-found' || code === 'invalid-token') return confirmationPage_('رابط غير صالح', 'هذا الرابط غير صحيح أو لم يعد صالحاً.', false);
  return confirmationPage_('تعذر تأكيد الحضور', 'يرجى المحاولة لاحقاً أو التواصل مع المنظمين.', false);
}

function doPost(e) {
  try {
    const token = e && e.parameter ? e.parameter.confirm : '';
    return handleConfirmation_(token);
  } catch (error) {
    return handleError_(error);
  }
}

function doGet(e) {
  try {
    const token = e && e.parameter ? e.parameter.confirm : '';
    if (!token) return confirmationPage_('رابط غير صحيح', 'لم يتم العثور على رمز التأكيد.', false);
    
    if (e && e.parameter && e.parameter.action === 'confirm') {
      return handleConfirmation_(token);
    }
    
    const match = findParticipantByConfirmationToken_(token);
    if (match.participant.data.confirmationStatus === 'confirmed') {
      return confirmationPage_('تم تأكيد حضوركم مسبقاً', 'شكراً ' + match.participant.data.name + '، حضوركم مسجل ومؤكد لدينا.', true);
    }
    return confirmationPromptPage_(match.participant, token);
  } catch (error) {
    return handleError_(error);
  }
}
