import { Icon } from '../../components/Icon';
import { formatEventAction } from './model';
import type { AuditEvent } from './model';

interface ActivityLogProps {
  events: AuditEvent[];
}

export function ActivityLog({ events }: ActivityLogProps) {
  return (
    <section className="panel activity-panel" aria-label="Change history">
      <div className="panel-heading activity-heading">
        <div>
          <p className="eyebrow">03 / AUDIT TRAIL</p>
          <h2>Change history</h2>
          <p className="panel-description">A record of the decisions made during this review.</p>
        </div>
        <span className="event-count">{events.length} {events.length === 1 ? 'event' : 'events'}</span>
      </div>

      {events.length === 0 ? (
        <div className="activity-empty-state">
          <span className="activity-empty-icon"><Icon name="history" size={20} /></span>
          <div>
            <strong>No activity yet</strong>
            <p>Edits, approvals, rejections and manual fields will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="activity-table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Action</th>
                <th scope="col">Previous value</th>
                <th scope="col">New value</th>
                <th scope="col">By</th>
                <th scope="col">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="activity-field-cell">{event.fieldLabel}</td>
                  <td><span className={`activity-action activity-action--${event.action}`}>{formatEventAction(event.action)}</span></td>
                  <td className="activity-value-cell">{event.previousValue || <span className="muted-value">—</span>}</td>
                  <td className="activity-value-cell">{event.newValue || <span className="muted-value">—</span>}</td>
                  <td>{event.actor}</td>
                  <td className="activity-timestamp">{formatTimestamp(event.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="activity-footer">
        <span><Icon name="shield-check" size={14} /> Session audit trail</span>
        <span>Newest first</span>
      </div>
    </section>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

