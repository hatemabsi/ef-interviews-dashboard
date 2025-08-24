import Layout from "@/components/layout/Layout";
import IdeasTable from "@/components/ideas/IdeasTable";

export default function IdeasPage() {
  return (
    <Layout>
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Ideas
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 break-words hyphens-auto max-w-full">
        Manage your ideas. Start a new one, pause an existing one, and review
        cofounders.
      </p>
      <div className="mt-6">
        <IdeasTable />
      </div>
    </Layout>
  );
}
