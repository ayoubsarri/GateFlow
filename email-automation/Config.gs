const INAS_EMAIL = Object.freeze({
  PROJECT_ID: 'your-firebase-project-id',
  EVENT_ID: 'your-event-id-2026',
  DEFAULT_CONFIRMATION_BASE_URL: 'https://script.google.com/macros/s/YOUR_WEB_APP_ID/exec',
  DEFAULT_LOGO_URL: 'https://your-domain.web.app/logo.png',
  DEFAULT_TEST_EMAIL: 'test-organizer@example.com',
  DEFAULT_REPLY_TO: 'contact@example.org',
  DEFAULT_SENDER_NAME: 'Event Organizing Committee',
  BATCH_SIZE: 25,
  LEASE_MINUTES: 10
});

function onOpen() {
  // Standalone script: no Google Sheet menu is used.
}

function setupEmailConsole() {
  const props = PropertiesService.getScriptProperties();
  const defaults = {
    TEST_EMAIL: INAS_EMAIL.DEFAULT_TEST_EMAIL,
    REPLY_TO: INAS_EMAIL.DEFAULT_REPLY_TO,
    SENDER_NAME: INAS_EMAIL.DEFAULT_SENDER_NAME,
    CONFIRMATION_BASE_URL: INAS_EMAIL.DEFAULT_CONFIRMATION_BASE_URL,
    LOGO_URL: INAS_EMAIL.DEFAULT_LOGO_URL,
    CAMPAIGN_APPROVED: 'false'
  };
  Object.keys(defaults).forEach(function(key) {
    if (!props.getProperty(key)) props.setProperty(key, defaults[key]);
  });
  Logger.log('INAS setup ready. No Google Sheet is required.');
  return defaults;
}

function settings_() {
  const props = PropertiesService.getScriptProperties();
  return {
    test_email: props.getProperty('TEST_EMAIL') || INAS_EMAIL.DEFAULT_TEST_EMAIL,
    reply_to: props.getProperty('REPLY_TO') || INAS_EMAIL.DEFAULT_REPLY_TO,
    sender_name: props.getProperty('SENDER_NAME') || INAS_EMAIL.DEFAULT_SENDER_NAME,
    confirmation_base_url: props.getProperty('CONFIRMATION_BASE_URL') || INAS_EMAIL.DEFAULT_CONFIRMATION_BASE_URL,
    logo_url: props.getProperty('LOGO_URL') || INAS_EMAIL.DEFAULT_LOGO_URL,
    logo_file_id: props.getProperty('LOGO_FILE_ID') || ''
  };
}

function setSetting_(key, value) {
  const map = {
    campaign_approved: 'CAMPAIGN_APPROVED',
    test_email: 'TEST_EMAIL',
    reply_to: 'REPLY_TO',
    sender_name: 'SENDER_NAME',
    confirmation_base_url: 'CONFIRMATION_BASE_URL',
    logo_url: 'LOGO_URL',
    logo_file_id: 'LOGO_FILE_ID'
  };
  PropertiesService.getScriptProperties().setProperty(map[key] || key, String(value));
}

function appendCampaignLog_(action, email, state, note) {
  Logger.log(JSON.stringify({
    time: new Date().toISOString(),
    action: action || '',
    email: email || '',
    state: state || '',
    note: note || ''
  }));
}

function requireLogoBlob_() {
  const value = settings_();
  if (value.logo_file_id) {
    return DriveApp.getFileById(value.logo_file_id).getBlob().setName('inas-logo.png');
  }
  const response = UrlFetchApp.fetch(value.logo_url || INAS_EMAIL.DEFAULT_LOGO_URL, { muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('Could not load INAS logo from LOGO_URL.');
  }
  return response.getBlob().setName('inas-logo.png');
}

function inasSetup() {
  return setupEmailConsole();
}

function inasPreviewEmail() {
  return previewInvitation();
}

function inasSendTest() {
  return sendTestInvitation();
}

function inasSendReal() {
  return approveInvitationCampaign();
}

function inasStats() {
  return showCampaignStatus();
}
