/**
 * Embeddable Meetings dashboard — for loading inside GoHighLevel (iframe / custom
 * menu link). Same meetings page, but chrome-less: no left sidebar; a hamburger
 * menu in the top-right reaches the other sections (the deal/Nurture module is
 * hidden here). Reuses the Meetings page component and its auth/permission gate.
 */
import BookingsDashboard, { getServerSideProps as meetingsGate } from '../dashboard/bookings';

export default function EmbeddedMeetings(props) {
  return <BookingsDashboard {...props} embed />;
}

export const getServerSideProps = meetingsGate;
