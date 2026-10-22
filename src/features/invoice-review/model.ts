export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type ReviewAction = 'edited' | 'approved' | 'rejected' | 'edited_and_approved' | 'field_added';
export type BoundingBox = readonly [left: number, top: number, right: number, bottom: number];

export interface InvoiceField {
  id: string;
  key: string;
  label: string;
  value: string;
  page: number;
  /** Normalized page coordinates in the [0, 1] range. */
  bbox: BoundingBox;
  status: ReviewStatus;
  source: 'sample' | 'manual';
}

export interface AuditEvent {
  id: string;
  fieldId: string;
  fieldLabel: string;
  action: ReviewAction;
  previousValue: string;
  newValue: string;
  timestamp: string;
  actor: string;
}

export interface ReviewState {
  fields: InvoiceField[];
  events: AuditEvent[];
  selectedFieldId: string | null;
}

export type ReviewActionPayload =
  | { type: 'select-field'; fieldId: string }
  | { type: 'save-edit'; fieldId: string; value: string; eventId: string; timestamp: string }
  | { type: 'approve-field'; fieldId: string; value: string; eventId: string; timestamp: string }
  | { type: 'reject-field'; fieldId: string; eventId: string; timestamp: string }
  | { type: 'add-field'; field: InvoiceField; eventId: string; timestamp: string }
  | { type: 'reset'; fields: InvoiceField[] };

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 900;

type MockField = {
  id: string;
  key: string;
  label: string;
  value: string;
  bbox: BoundingBox;
};

const MOCK_FIELDS: readonly MockField[] = [
  {
    id: 'invoice-number',
    key: 'invoiceNumber',
    label: 'Invoice number',
    value: 'INV-2041',
    bbox: [120, 80, 260, 100],
  },
  {
    id: 'invoice-date',
    key: 'date',
    label: 'Invoice date',
    value: '2026-09-14',
    bbox: [400, 80, 520, 100],
  },
  {
    id: 'total-amount',
    key: 'totalAmount',
    label: 'Total amount',
    value: '48,250.00',
    bbox: [400, 620, 520, 645],
  },
];

export function normalizeBox(box: BoundingBox, width = DESIGN_WIDTH, height = DESIGN_HEIGHT): BoundingBox {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const [left, top, right, bottom] = box;
  const normalizedLeft = clamp(left / safeWidth);
  const normalizedTop = clamp(top / safeHeight);
  const normalizedRight = clamp(right / safeWidth);
  const normalizedBottom = clamp(bottom / safeHeight);

  return [
    Math.min(normalizedLeft, normalizedRight),
    Math.min(normalizedTop, normalizedBottom),
    Math.max(normalizedLeft, normalizedRight),
    Math.max(normalizedTop, normalizedBottom),
  ];
}

export function boxToPercentStyle(box: BoundingBox): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const [left, top, right, bottom] = box;
  return {
    left: toPercent(left),
    top: toPercent(top),
    width: toPercent(Math.max(0, right - left)),
    height: toPercent(Math.max(0, bottom - top)),
  };
}

export function createMockFields(): InvoiceField[] {
  return MOCK_FIELDS.map(({ bbox, ...field }) => ({
    ...field,
    bbox: normalizeBox(bbox),
    page: 1,
    status: 'pending',
    source: 'sample',
  }));
}

export function createInitialReviewState(): ReviewState {
  const fields = createMockFields();
  return {
    fields,
    events: [],
    selectedFieldId: fields[0]?.id ?? null,
  };
}

export function reviewReducer(state: ReviewState, action: ReviewActionPayload): ReviewState {
  switch (action.type) {
    case 'select-field':
      return state.fields.some((field) => field.id === action.fieldId)
        ? { ...state, selectedFieldId: action.fieldId }
        : state;

    case 'save-edit': {
      const field = state.fields.find((item) => item.id === action.fieldId);
      if (!field || field.value === action.value) return state;

      const updatedField: InvoiceField = { ...field, value: action.value, status: 'pending' };
      return {
        ...state,
        fields: replaceField(state.fields, updatedField),
        events: [
          createEvent(updatedField, action.eventId, action.timestamp, 'edited', field.value, action.value),
          ...state.events,
        ],
      };
    }

    case 'approve-field': {
      const field = state.fields.find((item) => item.id === action.fieldId);
      if (!field) return state;

      const valueChanged = field.value !== action.value;
      const updatedField: InvoiceField = { ...field, value: action.value, status: 'approved' };
      const event = createEvent(
        updatedField,
        action.eventId,
        action.timestamp,
        valueChanged ? 'edited_and_approved' : 'approved',
        field.value,
        action.value,
      );

      return {
        ...state,
        fields: replaceField(state.fields, updatedField),
        events: [event, ...state.events],
      };
    }

    case 'reject-field': {
      const field = state.fields.find((item) => item.id === action.fieldId);
      if (!field) return state;

      const updatedField: InvoiceField = { ...field, status: 'rejected' };
      return {
        ...state,
        fields: replaceField(state.fields, updatedField),
        events: [
          createEvent(updatedField, action.eventId, action.timestamp, 'rejected', field.value, field.value),
          ...state.events,
        ],
      };
    }

    case 'add-field': {
      const field = action.field;
      const event = createEvent(field, action.eventId, action.timestamp, 'field_added', '', field.value);
      return {
        fields: [...state.fields, field],
        events: [event, ...state.events],
        selectedFieldId: field.id,
      };
    }

    case 'reset': {
      return {
        fields: action.fields,
        events: [],
        selectedFieldId: action.fields[0]?.id ?? null,
      };
    }

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function countStatuses(fields: readonly InvoiceField[]) {
  return fields.reduce(
    (counts, field) => {
      counts[field.status] += 1;
      return counts;
    },
    { pending: 0, approved: 0, rejected: 0 },
  );
}

export function formatEventAction(action: ReviewAction): string {
  switch (action) {
    case 'edited': return 'Edited';
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
    case 'edited_and_approved': return 'Edited & approved';
    case 'field_added': return 'Manual field added';
  }
}

function createEvent(
  field: InvoiceField,
  id: string,
  timestamp: string,
  action: ReviewAction,
  previousValue: string,
  newValue: string,
): AuditEvent {
  return {
    id,
    fieldId: field.id,
    fieldLabel: field.label,
    action,
    previousValue,
    newValue,
    timestamp,
    actor: 'You',
  };
}

function replaceField(fields: InvoiceField[], nextField: InvoiceField): InvoiceField[] {
  return fields.map((field) => field.id === nextField.id ? nextField : field);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toPercent(value: number): string {
  return `${Number((value * 100).toFixed(4))}%`;
}
