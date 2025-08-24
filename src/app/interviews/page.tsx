import Layout from "@/components/layout/Layout";
import InterviewsTable from "@/components/interviews/InterviewsTable";

export default function InterviewsPage() {
  return (
    <Layout>
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Interviews
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 break-words hyphens-auto max-w-full">
        Browse and search interviews. Filter by idea, company, role, source, and
        pain score.
      </p>
      <div className="mt-6 overflow-x-hidden">
        <InterviewsTable />
      </div>
    </Layout>
  );
}
