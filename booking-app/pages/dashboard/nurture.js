/**
 * Legacy route: In-Process Nurture is now DealOS.
 * Kept as a redirect so bookmarks and existing links don't break.
 */
export async function getServerSideProps() {
  return {
    redirect: { destination: '/dashboard/dealos', permanent: false },
  };
}

export default function NurtureRedirect() {
  return null;
}
