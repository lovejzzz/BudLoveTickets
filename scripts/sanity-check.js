#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const apiPath = path.join(root, 'api', 'tickets.js');

function assert(cond, message) {
  if (!cond) {
    console.error('❌', message);
    process.exitCode = 1;
  } else {
    console.log('✅', message);
  }
}

const index = fs.readFileSync(indexPath, 'utf8');
const api = fs.readFileSync(apiPath, 'utf8');

assert(index.includes('LOCAL_CACHE_KEY'), 'Client-side offline cache is enabled');
assert(index.includes('bulkMoveSelected'), 'Bulk operations are wired');
assert(index.includes('handleTicketShortcuts'), 'Keyboard shortcuts are present');
assert(index.includes('ticketOwner') && index.includes('ticketDue') && index.includes('ticketEffort'), 'Extended ticket metadata fields are present');
assert(api.includes('mergeTickets('), 'Server merge/conflict handling exists');
assert(api.includes('diagnostics'), 'Server diagnostics payload exists');

if (process.exitCode) {
  console.error('\nSanity check failed.');
  process.exit(process.exitCode);
}

console.log('\nSanity check passed.');
