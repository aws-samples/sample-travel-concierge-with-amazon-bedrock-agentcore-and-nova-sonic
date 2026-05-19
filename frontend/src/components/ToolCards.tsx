/**
 * Tool Result Cards
 *
 * Renders structured data cards from Lambda tool results.
 * Each card is typed to a specific tool response shape.
 * Speech handles the conversational layer — cards handle the visual layer.
 */

import React from 'react';

// ─── Shared styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  backgroundColor: '#F0F6FF',
  border: '1px solid #C8DEFF',
  borderLeft: '3px solid #0066CC',
  borderRadius: '10px',
  padding: '12px 16px',
  fontSize: '14px',
  color: '#1A1A1A',
  maxWidth: '420px',
};

const cardTitle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#0066CC',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px',
};

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '5px 0',
  borderBottom: '1px solid #E0ECFF',
};

const rowLast: React.CSSProperties = {
  ...row,
  borderBottom: 'none',
};

const label: React.CSSProperties = {
  color: '#555',
  fontSize: '13px',
};

const value: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '13px',
  color: '#0F2B46',
};

const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '10px',
  fontSize: '11px',
  fontWeight: 600,
  backgroundColor: color === 'green' ? '#E6F9F0' : color === 'red' ? '#FFF0F0' : color === 'orange' ? '#FFF8E6' : '#F0F0F0',
  color: color === 'green' ? '#1A7A4A' : color === 'red' ? '#CC0000' : color === 'orange' ? '#B36A00' : '#555',
});

// ─── Itinerary Card ────────────────────────────────────────────────────────────

interface Booking {
  bookingId?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureCity?: string;
  arrivalCity?: string;
  departureTime?: string;
  status?: string;
  fareClass?: string;
}

interface ItineraryData {
  bookings?: Booking[];
}

export function ItineraryCard({ data }: { data: ItineraryData }) {
  if (!data.bookings?.length) return null;
  return (
    <div style={card}>
      <div style={cardTitle}>✈️ Upcoming Flights</div>
      {(data.bookings ?? []).map((b, i) => {
        const isLast = i === (data.bookings ?? []).length - 1;
        const from = b.departureAirport || b.departureCity || '—';
        const to = b.arrivalAirport || b.arrivalCity || '—';
        const date = b.departureTime ? new Date(b.departureTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        return (
          <div key={i} style={isLast ? rowLast : row}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#0066CC' }}>{b.flightNumber || '—'}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>{from} → {to}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>{date}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {b.status && <span style={badge(b.status === 'CONFIRMED' ? 'green' : 'orange')}>{b.status}</span>}
              {b.fareClass && <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>{b.fareClass}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Flight Status Card ────────────────────────────────────────────────────────

interface FlightStatusData {
  flightNumber?: string;
  date?: string;
  status?: string;
  delayMinutes?: number;
  scheduledDeparture?: string;
  estimatedDeparture?: string;
  departureGate?: string;
  previousGate?: string;
  departureTerminal?: string;
  alerts?: string[];
}

export function FlightStatusCard({ data }: { data: FlightStatusData }) {
  const isDelayed = (data.status || '').toLowerCase() === 'delayed' || (data.delayMinutes || 0) > 0;
  const statusColor = isDelayed ? 'orange' : data.status?.toLowerCase() === 'cancelled' ? 'red' : 'green';
  const depTime = data.estimatedDeparture || data.scheduledDeparture;
  const formattedTime = depTime ? new Date(depTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null;

  return (
    <div style={card}>
      <div style={cardTitle}>🛫 Flight Status — {data.flightNumber}</div>
      <div style={row}>
        <span style={label}>Status</span>
        <span style={badge(statusColor)}>{data.status || '—'}{isDelayed && data.delayMinutes ? ` +${data.delayMinutes} min` : ''}</span>
      </div>
      {formattedTime && (
        <div style={row}>
          <span style={label}>{isDelayed ? 'New Departure' : 'Departure'}</span>
          <span style={value}>{formattedTime}</span>
        </div>
      )}
      {data.departureGate && (
        <div style={row}>
          <span style={label}>Gate</span>
          <span style={value}>
            {data.departureGate}
            {data.previousGate && <span style={{ fontSize: '11px', color: '#888', marginLeft: '6px' }}>was {data.previousGate}</span>}
          </span>
        </div>
      )}
      {data.departureTerminal && (
        <div style={rowLast}>
          <span style={label}>Terminal</span>
          <span style={value}>{data.departureTerminal}</span>
        </div>
      )}
    </div>
  );
}

// ─── Passenger + Meal Card (merged) ──────────────────────────────────────────

interface Passenger {
  name?: string;
  seatNumber?: string;
  mealPreference?: string;
  specialRequests?: string;
  passportExpiry?: string;
}

interface PassengerData {
  bookingId?: string;
  passengers?: Passenger[];
}

export function PassengerCard({ data, flightNumber }: { data: PassengerData; flightNumber?: string }) {
  const passengers = data.passengers || [];
  if (!passengers.length) return null;

  // Use flightNumber from data (Lambda now returns it) or from prop
  const flight = (data as Record<string, unknown>).flightNumber as string || flightNumber;
  const from = (data as Record<string, unknown>).departureAirport as string || '';
  const to = (data as Record<string, unknown>).arrivalAirport as string || '';
  const routeLabel = flight ? `${flight}${from && to ? ` · ${from}→${to}` : ''}` : '';

  return (
    <div style={{ ...card, maxWidth: '360px' }}>
      <div style={cardTitle}>👥 Passengers{routeLabel ? ` — ${routeLabel}` : ''}</div>
      {passengers.map((p, i) => {
        const isLast = i === passengers.length - 1;
        const meal = (p.mealPreference || '').toUpperCase();
        const mealColors = MEAL_COLOR[meal] || { bg: '#F5F5F5', text: '#444' };
        return (
          <div key={i} style={isLast ? rowLast : row}>
            <div style={{ fontWeight: 600, fontSize: '13px', flex: 1 }}>{p.name || '—'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', marginLeft: '12px' }}>
              {p.seatNumber && (
                <span style={{ ...value, fontSize: '13px', color: '#0066CC' }}>Seat {p.seatNumber}</span>
              )}
              {p.mealPreference && (
                <div style={{
                  backgroundColor: mealColors.bg,
                  color: mealColors.text,
                  padding: '1px 7px',
                  borderRadius: '8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}>
                  {p.mealPreference}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Keep MealCard as a no-op — merged into PassengerCard above
export function MealCard({ data, flightNumber }: { data: PassengerData; flightNumber?: string }) {
  void data; void flightNumber;
  return null;
}

// ─── Loyalty Card ─────────────────────────────────────────────────────────────

interface LoyaltyData {
  loyaltyTier?: string;
  loyaltyPoints?: number;
  loungeAccess?: boolean;
  tierExpiry?: string;
}

export function LoyaltyCard({ data }: { data: LoyaltyData }) {
  const tierColor = data.loyaltyTier === 'PLATINUM' ? '#7B2FBE' : data.loyaltyTier === 'GOLD' ? '#B36A00' : data.loyaltyTier === 'SILVER' ? '#555' : '#0066CC';
  return (
    <div style={card}>
      <div style={cardTitle}>⭐ Loyalty Status</div>
      <div style={row}>
        <span style={label}>Tier</span>
        <span style={{ ...value, color: tierColor }}>{data.loyaltyTier || '—'}</span>
      </div>
      <div style={data.loungeAccess !== undefined ? row : rowLast}>
        <span style={label}>Points</span>
        <span style={value}>{data.loyaltyPoints?.toLocaleString() || '—'}</span>
      </div>
      {data.loungeAccess !== undefined && (
        <div style={rowLast}>
          <span style={label}>Lounge Access</span>
          <span style={badge(data.loungeAccess ? 'green' : 'red')}>{data.loungeAccess ? 'Yes' : 'No'}</span>
        </div>
      )}
    </div>
  );
}

// ─── Booking Details Card ──────────────────────────────────────────────────────

interface BookingData {
  bookingId?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureTime?: string;
  status?: string;
  fareClass?: string;
  totalPassengers?: number;
}

export function BookingCard({ data }: { data: BookingData }) {
  const date = data.departureTime ? new Date(data.departureTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  return (
    <div style={card}>
      <div style={cardTitle}>📄 Booking — {data.flightNumber || data.bookingId}</div>
      {data.departureAirport && data.arrivalAirport && (
        <div style={row}>
          <span style={label}>Route</span>
          <span style={value}>{data.departureAirport} → {data.arrivalAirport}</span>
        </div>
      )}
      {date && (
        <div style={row}>
          <span style={label}>Date</span>
          <span style={value}>{date}</span>
        </div>
      )}
      {data.fareClass && (
        <div style={row}>
          <span style={label}>Class</span>
          <span style={value}>{data.fareClass}</span>
        </div>
      )}
      {data.status && (
        <div style={rowLast}>
          <span style={label}>Status</span>
          <span style={badge(data.status === 'CONFIRMED' ? 'green' : 'orange')}>{data.status}</span>
        </div>
      )}
    </div>
  );
}

// ─── Preferences Card ─────────────────────────────────────────────────────────

interface PreferencesData {
  dietaryPreference?: string;
  seatPosition?: string;
  preferredRows?: string;
  airportTransfer?: string;
  wifiPreference?: string;
  preferences?: Record<string, Record<string, unknown>>;
}

export function PreferencesCard({ data }: { data: PreferencesData }) {
  // If gateway didn't unwrap Lambda body, parse it
  const d = (typeof (data as Record<string, unknown>).body === 'string')
    ? (() => { try { return JSON.parse((data as Record<string, unknown>).body as string) as PreferencesData; } catch { return data; } })()
    : data;

  const prefs: { label: string; val: string }[] = [];

  if (d.preferences && typeof d.preferences === 'object') {
    for (const category of Object.values(d.preferences)) {
      if (typeof category !== 'object') continue;
      for (const [key, val] of Object.entries(category as Record<string, unknown>)) {
        if (key === 'confidence' || key === 'lastUpdated') continue;
        if (!val || typeof val === 'object') continue;
        const niceLabel = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        prefs.push({ label: niceLabel, val: String(val) });
      }
    }
  } else {
    if (d.dietaryPreference) prefs.push({ label: 'Meal', val: d.dietaryPreference });
    if (d.seatPosition)      prefs.push({ label: 'Seat', val: d.seatPosition });
    if (d.preferredRows)     prefs.push({ label: 'Rows', val: d.preferredRows });
    if (d.airportTransfer)   prefs.push({ label: 'Transfer', val: d.airportTransfer });
    if (d.wifiPreference)    prefs.push({ label: 'WiFi', val: d.wifiPreference });
  }

  if (!prefs.length) return null;
  return (
    <div style={card}>
      <div style={cardTitle}>⚙️ Your Preferences</div>
      {prefs.map((p, i) => (
        <div key={i} style={i === prefs.length - 1 ? rowLast : row}>
          <span style={label}>{p.label}</span>
          <span style={value}>{p.val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Escalation Card ──────────────────────────────────────────────────────────

interface EscalationData {
  referenceNumber?: string;
  estimatedWaitMinutes?: number;
  priority?: string;
  reason?: string;
  queuePosition?: number;
  supportPhone?: string;
}

export function EscalationCard({ data }: { data: EscalationData }) {
  const phone = data.supportPhone || '';

  // Auto-dial when card mounts — user already confirmed escalation
  React.useEffect(() => {
    if (phone) {
      const timer = setTimeout(() => {
        window.location.href = `tel:${phone.replace(/[\s\-\(\)]/g, '')}`;
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [phone]);

  return (
    <div style={{
      ...card,
      maxWidth: '320px',
      borderLeft: '3px solid #DC3545',
      backgroundColor: '#FFF5F5',
    }}>
      <div style={{ ...cardTitle, color: '#DC3545' }}>🎧 Connecting to Live Agent</div>

      {data.referenceNumber && (
        <div style={row}>
          <span style={label}>Reference</span>
          <span style={{ ...value, fontFamily: 'monospace', letterSpacing: '1px' }}>{data.referenceNumber}</span>
        </div>
      )}
      {data.queuePosition && (
        <div style={row}>
          <span style={label}>Queue Position</span>
          <span style={value}>#{data.queuePosition}</span>
        </div>
      )}
      {data.estimatedWaitMinutes && (
        <div style={phone ? row : rowLast}>
          <span style={label}>Est. Wait</span>
          <span style={value}>{data.estimatedWaitMinutes} min</span>
        </div>
      )}

      {phone && (
        <div style={{ ...rowLast, paddingTop: '10px' }}>
          <a
            href={`tel:${phone.replace(/[\s\-\(\)]/g, '')}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px',
              backgroundColor: '#DC3545',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            📞 {phone}
          </a>
        </div>
      )}
    </div>
  );
}

export function GenericCard({ toolName, data }: { toolName: string; data: Record<string, unknown> }) {
  // Only show if there's meaningful data beyond just summary
  const keys = Object.keys(data).filter(k => k !== 'summary' && data[k] !== null && data[k] !== undefined);
  if (!keys.length) return null;
  return (
    <div style={card}>
      <div style={cardTitle}>🔧 {toolName.replace('th-backend-api___', '').replace(/([A-Z])/g, ' $1').trim()}</div>
      {keys.slice(0, 5).map((k, i) => {
        const v = data[k];
        if (typeof v === 'object') return null;
        return (
          <div key={i} style={i === Math.min(keys.length, 5) - 1 ? rowLast : row}>
            <span style={label}>{k}</span>
            <span style={value}>{String(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Meal Card ────────────────────────────────────────────────────────────────

const MEAL_EMOJI: Record<string, string> = {
  VEGETARIAN: '🥗',
  VEGAN: '🌱',
  HALAL: '🌙',
  KOSHER: '✡️',
  'GLUTEN-FREE': '🌾',
  'DAIRY-FREE': '🥛',
  REGULAR: '🍽️',
  STANDARD: '🍽️',
  HINDU: '🪔',
  JAIN: '🙏',
  MUSLIM: '☪️',
  DIABETIC: '💊',
  'FRUIT-VEG': '🍎',
  BUDDHIST: '☸️',
  LACTATE: '🥛',
};

const MEAL_COLOR: Record<string, { bg: string; text: string }> = {
  VEGETARIAN: { bg: '#E8F8EE', text: '#1A7A4A' },
  VEGAN: { bg: '#E8F8EE', text: '#1A7A4A' },
  HALAL: { bg: '#FFF3E0', text: '#B36A00' },
  KOSHER: { bg: '#F3E8FF', text: '#6B21A8' },
  'GLUTEN-FREE': { bg: '#FFF8E6', text: '#92600A' },
  'DAIRY-FREE': { bg: '#E8F4FF', text: '#1A5FA8' },
  REGULAR: { bg: '#F5F5F5', text: '#444' },
  STANDARD: { bg: '#F5F5F5', text: '#444' },
  HINDU: { bg: '#FFF3E0', text: '#B36A00' },
  JAIN: { bg: '#E8F8EE', text: '#1A7A4A' },
  MUSLIM: { bg: '#FFF3E0', text: '#B36A00' },
  DIABETIC: { bg: '#E8F4FF', text: '#1A5FA8' },
  'FRUIT-VEG': { bg: '#E8F8EE', text: '#1A7A4A' },
  BUDDHIST: { bg: '#F3E8FF', text: '#6B21A8' },
  LACTATE: { bg: '#E8F4FF', text: '#1A5FA8' },
};

// ─── Seat Change Confirmation Card ───────────────────────────────────────────

interface SeatChangeData {
  message?: string;
  newSeat?: string;
  bookingId?: string;
  passengerId?: string;
  flightNumber?: string;
}

export function SeatChangeCard({ data, flightNumber }: { data: SeatChangeData; flightNumber?: string }) {
  if (!data.newSeat) return null;
  const match = data.message?.match(/from (\w+) to (\w+)/i);
  const oldSeat = match?.[1];
  const newSeat = match?.[2] || data.newSeat;
  const flight = data.flightNumber || flightNumber;

  return (
    <div style={{ ...card, maxWidth: '300px', borderLeft: '3px solid #1A7A4A', backgroundColor: '#E8F8EE' }}>
      <div style={{ ...cardTitle, color: '#1A7A4A' }}>✅ Seat Updated{flight ? ` — ${flight}` : ''}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
        {oldSeat && (
          <>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>From</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#CC0000', textDecoration: 'line-through' }}>{oldSeat}</div>
            </div>
            <div style={{ fontSize: '18px', color: '#888' }}>→</div>
          </>
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>New Seat</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1A7A4A' }}>{newSeat}</div>
        </div>
      </div>
      {data.bookingId && (
        <div style={{ fontSize: '11px', color: '#888', paddingTop: '4px' }}>Booking: {data.bookingId}</div>
      )}
    </div>
  );
}

// ─── Meal Change Confirmation Card ───────────────────────────────────────────

interface MealChangeData {
  message?: string;
  action?: string;
  passengerId?: string;
  passengerName?: string;
  bookingId?: string;
  flightNumber?: string;
}

export function MealChangeCard({ data, flightNumber }: { data: MealChangeData; flightNumber?: string }) {
  if (data.action !== 'meal') return null;
  const mealMatch = data.message?.match(/updated to (.+)/i);
  const newMeal = mealMatch?.[1]?.toUpperCase() || '';
  const emoji = MEAL_EMOJI[newMeal] || '🍽️';
  const colors = MEAL_COLOR[newMeal] || MEAL_COLOR['REGULAR'];
  const flight = data.flightNumber || flightNumber;
  const name = data.passengerName;

  return (
    <div style={{ ...card, maxWidth: '300px', borderLeft: '3px solid #1A7A4A', backgroundColor: '#E8F8EE' }}>
      <div style={{ ...cardTitle, color: '#1A7A4A' }}>✅ Meal Updated{flight ? ` — ${flight}` : ''}</div>
      {name && (
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F2B46', marginBottom: '6px' }}>{name}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
        <span style={{ fontSize: '28px' }}>{emoji}</span>
        <div>
          <div style={{
            backgroundColor: colors.bg,
            color: colors.text,
            padding: '3px 10px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'inline-block',
          }}>
            {mealMatch?.[1] || 'Updated'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Meal Options Card ────────────────────────────────────────────────────────

const ALL_MEAL_OPTIONS = [
  { key: 'VEGETARIAN', emoji: '🥗', label: 'Vegetarian' },
  { key: 'VEGAN', emoji: '🌱', label: 'Vegan' },
  { key: 'REGULAR', emoji: '🍽️', label: 'Regular' },
  { key: 'HALAL', emoji: '🌙', label: 'Halal' },
  { key: 'KOSHER', emoji: '✡️', label: 'Kosher' },
  { key: 'GLUTEN-FREE', emoji: '🌾', label: 'Gluten-Free' },
  { key: 'DAIRY-FREE', emoji: '🥛', label: 'Dairy-Free' },
  { key: 'DIABETIC', emoji: '💊', label: 'Diabetic' },
  { key: 'JAIN', emoji: '🙏', label: 'Jain' },
  { key: 'HINDU', emoji: '🪔', label: 'Hindu' },
  { key: 'MUSLIM', emoji: '☪️', label: 'Muslim' },
  { key: 'FRUIT-VEG', emoji: '🍎', label: 'Fruit & Veg' },
];

export function MealOptionsCard() {
  return (
    <div style={{ ...card, maxWidth: '380px' }}>
      <div style={cardTitle}>🍽️ Available Meal Options</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '4px' }}>
        {ALL_MEAL_OPTIONS.map(({ key, emoji, label }) => {
          const colors = MEAL_COLOR[key] || MEAL_COLOR['REGULAR'];
          return (
            <div key={key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: colors.bg,
              color: colors.text,
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              <span>{emoji}</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Seat Map Card ────────────────────────────────────────────────────────────

interface Seat {
  seatNumber: string;
  row: number;
  column: string;
  isAvailable: boolean;
  seatType?: string;
  isExitRow?: boolean;
  isExtraLegroom?: boolean;
  assignedTo?: string;
  price?: number;
}

interface SeatMapData {
  flightNumber?: string;
  date?: string;
  totalSeats?: number;
  availableSeats?: number;
  seats?: Seat[];
}

export function SeatMapCard({ data }: { data: SeatMapData }) {
  const seats = data.seats || [];
  if (!seats.length) return null;

  // Build row → column → seat lookup
  const seatMap: Record<number, Record<string, Seat>> = {};
  for (const s of seats) {
    const r = Number(s.row);
    if (!seatMap[r]) seatMap[r] = {};
    seatMap[r][s.column] = s;
  }

  const rows = Object.keys(seatMap).map(Number).sort((a, b) => a - b);
  const allCols = Array.from(new Set(seats.map(s => s.column))).sort();

  // Split columns into groups with aisle gap (3+3 for A-F, 2+2 for A-D, etc.)
  const leftCols = allCols.slice(0, Math.ceil(allCols.length / 2));
  const rightCols = allCols.slice(Math.ceil(allCols.length / 2));

  const getSeatColor = (seat: Seat | undefined): string => {
    if (!seat) return 'transparent';
    if (!seat.isAvailable) return '#0066CC';      // occupied — blue
    if (seat.isExtraLegroom) return '#00A896';    // extra legroom — teal
    if (seat.isExitRow) return '#E8A000';         // exit row — amber
    return '#C8DEFF';                             // available — light blue
  };

  const getSeatBorder = (seat: Seat | undefined): string => {
    if (!seat) return 'transparent';
    if (!seat.isAvailable) return '#004A99';
    if (seat.isExtraLegroom) return '#007A6E';
    if (seat.isExitRow) return '#B37800';
    return '#7AABFF';
  };

  const seatStyle = (seat: Seat | undefined): React.CSSProperties => ({
    width: '22px',
    height: '22px',
    borderRadius: '4px 4px 2px 2px',
    backgroundColor: getSeatColor(seat),
    border: `1px solid ${getSeatBorder(seat)}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '8px',
    fontWeight: 700,
    color: seat && !seat.isAvailable ? 'white' : '#0F2B46',
    cursor: seat?.isAvailable ? 'default' : 'default',
    flexShrink: 0,
  });

  const colHeader: React.CSSProperties = {
    width: '22px',
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: '#666',
    flexShrink: 0,
  };

  return (
    <div style={{ ...card, maxWidth: '360px', padding: '12px 14px' }}>
      <div style={cardTitle}>💺 Seat Map — {data.flightNumber}</div>
      <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
        {data.availableSeats} of {data.totalSeats} seats available
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '4px', paddingLeft: '24px' }}>
        {leftCols.map(c => <div key={c} style={colHeader}>{c}</div>)}
        <div style={{ width: '12px' }} />
        {rightCols.map(c => <div key={c} style={colHeader}>{c}</div>)}
      </div>

      {/* Seat rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '320px', overflowY: 'auto' }}>
        {rows.map(r => {
          const rowSeats = seatMap[r] || {};
          const isExit = Object.values(rowSeats).some(s => s.isExitRow);
          return (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              {/* Row number */}
              <div style={{ width: '20px', fontSize: '10px', color: '#888', textAlign: 'right', flexShrink: 0 }}>
                {r}
              </div>
              {/* Left seats */}
              {leftCols.map(c => (
                <div key={c} style={seatStyle(rowSeats[c])}>
                  {rowSeats[c] && !rowSeats[c].isAvailable ? '●' : ''}
                </div>
              ))}
              {/* Aisle gap */}
              <div style={{ width: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isExit && <span style={{ fontSize: '8px', color: '#E8A000' }}>⬅</span>}
              </div>
              {/* Right seats */}
              {rightCols.map(c => (
                <div key={c} style={seatStyle(rowSeats[c])}>
                  {rowSeats[c] && !rowSeats[c].isAvailable ? '●' : ''}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
        {[
          { color: '#C8DEFF', border: '#7AABFF', label: 'Available' },
          { color: '#0066CC', border: '#004A99', label: 'Occupied' },
          { color: '#00A896', border: '#007A6E', label: 'Extra legroom' },
        ].map(({ color, border, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#555' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: color, border: `1px solid ${border}` }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Summary Card (fallback when gateway only returns summary text) ────────────

const TOOL_ICONS: Record<string, string> = {
  GetPreferences:      '⚙️',
  GetPassengerDetails: '👥',
  GetLoyaltyStatus:    '⭐',
  GetUpcomingItinerary:'✈️',
  GetFlightStatus:     '🛫',
  GetBookingDetails:   '📄',
  GetSeatMap:          '💺',
  UpdateSeat:          '✅',
  UpdatePassenger:     '✅',
  EscalateToAgent:     '🎧',
  QueryPolicy:         '📖',
};

function SummaryCard({ toolName, summary }: { toolName: string; summary: string }) {
  const icon = TOOL_ICONS[toolName] || '🔧';
  const title = toolName.replace(/([A-Z])/g, ' $1').trim();
  return (
    <div style={card}>
      <div style={cardTitle}>{icon} {title}</div>
      <div style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: '1.65' }}>
        {summary}
      </div>
    </div>
  );
}

// ─── Card router — picks the right card for a tool result ─────────────────────

export interface ToolResultPayload {
  toolName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  flightNumber?: string;
}

export function ToolResultCard({ payload }: { payload: ToolResultPayload }) {
  const { toolName, data, flightNumber } = payload;
  const name = toolName.replace('th-backend-api___', '');

  // If only summary is available (gateway stripped full response), show a summary card
  const onlySummary = Object.keys(data).filter(k => k !== 'summary').length === 0;

  switch (name) {
    case 'GetUpcomingItinerary':
      if (!onlySummary && data.bookings) return <ItineraryCard data={data} />;
      break;
    case 'GetFlightStatus':
      if (!onlySummary) return <FlightStatusCard data={data} />;
      break;
    case 'GetPassengerDetails':
      if (!onlySummary && data.passengers) return <PassengerCard data={data} flightNumber={flightNumber} />;
      break;
    case 'GetLoyaltyStatus':
      if (!onlySummary) return <LoyaltyCard data={data} />;
      break;
    case 'GetBookingDetails':
      if (!onlySummary) return <BookingCard data={data} />;
      break;
    case 'GetPreferences':
      if (!onlySummary) return <PreferencesCard data={data} />;
      break;
    case 'GetSeatMap':
      if (!onlySummary && data.seats) return <SeatMapCard data={data} />;
      break;
    case 'UpdateSeat':
      if (!onlySummary && data.newSeat) return <SeatChangeCard data={data} flightNumber={flightNumber} />;
      break;
    case 'UpdatePassenger':
      // No card — the agent re-fetches GetPassengerDetails after update, which shows the updated PassengerCard
      return null;
    case 'EscalateToAgent':
      if (!onlySummary) return <EscalationCard data={data} />;
      break;
    case 'QueryPolicy':
      if (!onlySummary) return <PolicyCard data={data} />;
      break;
    case 'GetPurchaseHistory':
    case 'SaveConversation':
    case 'GetRebookOptions':
      if (!onlySummary && data.rebookOptions) return <RebookOptionsCard data={data} />;
      return null;
    case 'GetUpgradeOptions':
    case 'UpdatePreferences':
    case 'RebookFlight':
      return null;
    default:
      break;
  }

  // Fallback: show summary as a styled info card if available
  if (data.summary && typeof data.summary === 'string') {
    return <SummaryCard toolName={name} summary={data.summary as string} />;
  }
  return null;
}

// ─── Welcome Card (shown at conversation start) ───────────────────────────────

const TIER_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  PLATINUM: { bg: '#F3E8FF', text: '#6B21A8', border: '#A855F7' },
  GOLD: { bg: '#FFF8E6', text: '#92600A', border: '#F59E0B' },
  SILVER: { bg: '#F1F5F9', text: '#475569', border: '#94A3B8' },
  BRONZE: { bg: '#FFF7ED', text: '#9A3412', border: '#FB923C' },
  MEMBER: { bg: '#EFF6FF', text: '#1D4ED8', border: '#60A5FA' },
};

interface WelcomeData {
  name: string;
  tier: string;
  points: number;
  loungeAccess: boolean;
}

export function WelcomeCard({ data }: { data: WelcomeData }) {
  const tier = (data.tier || 'MEMBER').toUpperCase();
  const colors = TIER_COLOR[tier] || TIER_COLOR['MEMBER'];
  const initials = data.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div style={{
      backgroundColor: '#0F2B46',
      borderRadius: '12px',
      padding: '14px 18px',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      maxWidth: '92%',
      alignSelf: 'flex-start',
      boxShadow: '0 2px 12px rgba(15,43,70,0.3)',
    }}>
      {/* Avatar + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '42px', height: '42px', borderRadius: '50%',
          backgroundColor: '#0066CC',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: 700, color: 'white', flexShrink: 0,
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{data.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
            <span style={{
              backgroundColor: colors.bg,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              padding: '1px 8px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 700,
            }}>
              {tier}
            </span>
            {data.loungeAccess && (
              <span style={{ fontSize: '11px', opacity: 0.8 }}>🛋️ Lounge</span>
            )}
          </div>
        </div>
      </div>

      {/* Miles */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#F59E0B' }}>
          {data.points.toLocaleString()}
        </div>
        <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '1px' }}>MILES</div>
      </div>
    </div>
  );
}

// ─── Rebook Options Card ──────────────────────────────────────────────────────

interface RebookOption {
  flightNumber?: string;
  date?: string;
  scheduledDeparture?: string;
  status?: string;
  fareDifference?: number;
  fareDifferenceDisplay?: string;
  availableSeats?: number;
  hasAdjacentGroupSeats?: boolean;
}

interface RebookOptionsData {
  currentBooking?: { flightNumber?: string; route?: string; delayMinutes?: number };
  rebookOptions?: RebookOption[];
  optionCount?: number;
}

export function RebookOptionsCard({ data }: { data: RebookOptionsData }) {
  const options = (data.rebookOptions || []).slice(0, 3);
  if (!options.length) return null;
  const total = data.optionCount || options.length;

  return (
    <div style={{ ...card, maxWidth: '380px' }}>
      <div style={cardTitle}>
        🔄 Rebook Options{total > 3 ? ` (showing 3 of ${total})` : ''}
      </div>
      {options.map((opt, i) => {
        const isLast = i === options.length - 1;
        const depTime = opt.scheduledDeparture
          ? new Date(opt.scheduledDeparture).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          : null;
        const isDelayed = (opt.status || '').toLowerCase() === 'delayed';
        const fareColor = (opt.fareDifference || 0) > 0 ? '#CC0000' : (opt.fareDifference || 0) < 0 ? '#1A7A4A' : '#555';
        return (
          <div key={i} style={isLast ? rowLast : row}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#0066CC' }}>{opt.flightNumber}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {depTime && <span>{depTime}</span>}
                {opt.availableSeats !== undefined && <span style={{ marginLeft: '8px' }}>{opt.availableSeats} seats</span>}
                {opt.hasAdjacentGroupSeats && <span style={{ marginLeft: '6px', color: '#1A7A4A' }}>✓ Group seats</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={badge(isDelayed ? 'orange' : 'green')}>{opt.status || 'ON TIME'}</span>
              {opt.fareDifferenceDisplay && (
                <div style={{ fontSize: '11px', color: fareColor, marginTop: '3px', fontWeight: 600 }}>
                  {opt.fareDifferenceDisplay}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Policy Card ──────────────────────────────────────────────────────────────

interface PolicyCitation {
  text?: string;
  sources?: { content?: string; location?: string }[];
}

interface PolicyData {
  question?: string;
  answer?: string;
  citations?: PolicyCitation[];
}

export function PolicyCard({ data }: { data: PolicyData }) {
  if (!data.answer && !data.question) return null;

  // Extract unique source document names from S3 URIs
  const sources: string[] = [];
  for (const citation of (data.citations || [])) {
    for (const src of (citation.sources || [])) {
      if (src.location) {
        // Parse filename from S3 URI: s3://bucket/path/baggage-policy.pdf → Baggage Policy
        const filename = src.location.split('/').pop() || '';
        const name = filename
          .replace(/\.[^.]+$/, '')           // remove extension
          .replace(/[-_]/g, ' ')             // dashes/underscores to spaces
          .replace(/\b\w/g, c => c.toUpperCase()); // title case
        if (name && !sources.includes(name)) sources.push(name);
      }
    }
  }

  return (
    <div style={{ ...card, maxWidth: '420px' }}>
      <div style={cardTitle}>📖 Policy</div>
      {data.question && (
        <div style={{
          fontSize: '12px', color: '#555', fontStyle: 'italic',
          marginBottom: '8px', paddingBottom: '8px',
          borderBottom: '1px solid #E0ECFF',
        }}>
          "{data.question}"
        </div>
      )}
      <div style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: '1.6' }}>
        {data.answer}
      </div>
      {sources.length > 0 && (
        <div style={{
          marginTop: '10px', paddingTop: '8px',
          borderTop: '1px solid #E0ECFF',
          display: 'flex', flexWrap: 'wrap', gap: '6px',
        }}>
          {sources.map((s, i) => (
            <span key={i} style={{
              fontSize: '10px', fontWeight: 600,
              backgroundColor: '#EEF4FF', color: '#0066CC',
              padding: '2px 8px', borderRadius: '8px',
            }}>
              📄 {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
