import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boxToPercentStyle,
  countStatuses,
  createInitialReviewState,
  createMockFields,
  normalizeBox,
  reviewReducer,
} from '../src/features/invoice-review/model.ts';
import type { InvoiceField } from '../src/features/invoice-review/model.ts';

const timestamp = '2026-10-22T13:00:00.000Z';

test('mock field boxes preserve the assignment coordinates as normalized page positions', () => {
  const [invoiceNumber, invoiceDate, totalAmount] = createMockFields();

  assert.deepEqual(invoiceNumber?.bbox, [120 / 720, 80 / 900, 260 / 720, 100 / 900]);
  assert.deepEqual(invoiceDate?.bbox, [400 / 720, 80 / 900, 520 / 720, 100 / 900]);
  assert.deepEqual(totalAmount?.bbox, [400 / 720, 620 / 900, 520 / 720, 645 / 900]);
});

test('normalizing a box clamps it to the page and fixes reversed corners', () => {
  assert.deepEqual(normalizeBox([120, 100, 60, 50], 600, 500), [0.1, 0.1, 0.2, 0.2]);
  assert.deepEqual(normalizeBox([-20, 10, 720, 900], 720, 900), [0, 10 / 900, 1, 1]);
});

test('box styles use percent coordinates so highlights scale with the source', () => {
  assert.deepEqual(boxToPercentStyle([0.1, 0.2, 0.4, 0.5]), {
    left: '10%',
    top: '20%',
    width: '30%',
    height: '30%',
  });
});

test('editing a value records before/after values and returns the field to pending review', () => {
  const state = createInitialReviewState();
  const field = state.fields[0];
  assert.ok(field);

  const next = reviewReducer(state, {
    type: 'save-edit', fieldId: field.id, value: 'INV-2042', eventId: 'event-1', timestamp,
  });

  assert.equal(next.fields[0]?.value, 'INV-2042');
  assert.equal(next.fields[0]?.status, 'pending');
  assert.deepEqual(next.events[0], {
    id: 'event-1',
    fieldId: field.id,
    fieldLabel: field.label,
    action: 'edited',
    previousValue: 'INV-2041',
    newValue: 'INV-2042',
    timestamp,
    actor: 'You',
  });
});

test('approving a draft value writes one combined edit-and-approve event', () => {
  const state = createInitialReviewState();
  const field = state.fields[0];
  assert.ok(field);

  const next = reviewReducer(state, {
    type: 'approve-field', fieldId: field.id, value: 'INV-2048', eventId: 'event-2', timestamp,
  });

  assert.equal(next.fields[0]?.value, 'INV-2048');
  assert.equal(next.fields[0]?.status, 'approved');
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0]?.action, 'edited_and_approved');
  assert.equal(next.events[0]?.previousValue, 'INV-2041');
  assert.equal(next.events[0]?.newValue, 'INV-2048');
});

test('rejecting a field records the action without mutating the extracted value', () => {
  const state = createInitialReviewState();
  const field = state.fields[1];
  assert.ok(field);

  const next = reviewReducer(state, {
    type: 'reject-field', fieldId: field.id, eventId: 'event-3', timestamp,
  });

  assert.equal(next.fields[1]?.status, 'rejected');
  assert.equal(next.fields[1]?.value, field.value);
  assert.equal(next.events[0]?.action, 'rejected');
});

test('adding a manual field selects it and records its creation', () => {
  const state = createInitialReviewState();
  const field: InvoiceField = {
    id: 'manual-1', key: 'manualField1', label: 'Manual field 1', value: '', page: 1,
    bbox: [0.2, 0.3, 0.4, 0.35], status: 'pending', source: 'manual',
  };
  const next = reviewReducer(state, {
    type: 'add-field', field, eventId: 'event-4', timestamp,
  });

  assert.equal(next.fields.length, 4);
  assert.equal(next.selectedFieldId, field.id);
  assert.equal(next.events[0]?.action, 'field_added');
});

test('status counts handle pending, approved and rejected fields', () => {
  const fields = createMockFields();
  fields[0] = { ...fields[0]!, status: 'approved' };
  fields[1] = { ...fields[1]!, status: 'rejected' };

  assert.deepEqual(countStatuses(fields), { pending: 1, approved: 1, rejected: 1 });
});

test('reset produces a clean review with no audit events', () => {
  const state = createInitialReviewState();
  const field = state.fields[0];
  assert.ok(field);
  const edited = reviewReducer(state, {
    type: 'save-edit', fieldId: field.id, value: 'INV-2050', eventId: 'event-5', timestamp,
  });
  const reset = reviewReducer(edited, { type: 'reset', fields: createMockFields() });

  assert.equal(reset.events.length, 0);
  assert.equal(reset.fields[0]?.value, 'INV-2041');
  assert.equal(reset.fields.every((item) => item.status === 'pending'), true);
});
