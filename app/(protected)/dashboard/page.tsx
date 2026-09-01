import { DashboardPage } from '@/views/dashboard';

// KST_AZURE_APP_ID is a runtime variable on the Container App, set by the deploy pipeline
// after the image is built. A statically prerendered page would bake in its build-time
// absence, so this page renders per request.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <DashboardPage azureAppId={process.env.KST_AZURE_APP_ID} />;
}
