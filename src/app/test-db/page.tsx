import { prisma } from "@/lib/prisma";

export default async function TestDbPage() {
  const categories = await prisma.skuCategories.findMany({
    orderBy: { SortOrder: "asc" },
    take: 20,
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Database Connection Test</h1>
      <p className="mb-4">
        Found <strong>{categories.length}</strong> categories
      </p>
      <table className="border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2">ID</th>
            <th className="border border-gray-300 px-4 py-2">Name</th>
            <th className="border border-gray-300 px-4 py-2">IsPreOrder</th>
            <th className="border border-gray-300 px-4 py-2">SortOrder</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.ID}>
              <td className="border border-gray-300 px-4 py-2">{cat.ID}</td>
              <td className="border border-gray-300 px-4 py-2">{cat.Name}</td>
              <td className="border border-gray-300 px-4 py-2">
                {cat.IsPreOrder ? "Yes" : "No"}
              </td>
              <td className="border border-gray-300 px-4 py-2">
                {cat.SortOrder ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}