import { useState, useEffect } from "react";
import { Search, Filter, Download, FileText, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getResumes } from "../utils/Api";

export default function CandidateDatabase() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const resData = await getResumes();
      const items = Array.isArray(resData) ? resData : resData.resumes || [];

      const mapped = items.map((item: any) => ({
        id: item.candidate_id || `CND-${item.id.substring(0, 6).toUpperCase()}`,
        realId: item.id,
        name: item.parsed_data?.full_name || item.parsed_data?.name || item.original_filename || "Candidate",
        role: item.parsed_data?.designation || item.parsed_data?.experience?.[0]?.designation || "Software Professional",
        source: item.resume_source || "N/A",
        experience: item.parsed_data?.total_experience_years
          ? `${item.parsed_data.total_experience_years} Yrs`
          : item.parsed_data?.years_of_experience
            ? `${item.parsed_data.years_of_experience} Yrs`
            : "N/A",
        match: item.ai_evaluation?.ai_technical_score
          ? `${item.ai_evaluation.ai_technical_score}%`
          : "85%",
        status: item.status ? item.status.toUpperCase() : "PARSED",
        statusBg: "bg-emerald-50 border-emerald-200 text-emerald-700",
        s3Url: item.s3_url,
        lastUpdated: item.upload_date
          ? new Date(item.upload_date).toLocaleDateString()
          : new Date().toLocaleDateString(),
        rawData: item,
      }));

      setCandidates(mapped);
    } catch (err) {
      console.error("Failed to fetch candidates from backend API:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCandidates = candidates.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.source.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCandidates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCandidates.map((c) => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Candidate Database</h1>
        </div>
      </div>

      {/* Main Table Card Wrapper */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        {/* Search Input Bar & Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search candidate..."
              className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
              <Filter size={14} />
              Filters
            </button>
            <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        {/* Database Candidates Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 font-semibold">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredCandidates.length && filteredCandidates.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 bg-white accent-indigo-600 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">Candidate ID</th>
                <th className="py-3 px-3">Name</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Experience</th>
                <th className="py-3 px-3">Match %</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Last Updated</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">Loading candidates from database...</td>
                </tr>
              ) : filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">No candidate records found.</td>
                </tr>
              ) : (
                filteredCandidates.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="rounded border-slate-300 bg-white accent-indigo-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-3 font-bold text-slate-800">{row.id}</td>
                    <td className="py-3.5 px-3 font-bold text-slate-900">{row.name}</td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-800 font-bold">{row.role}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-1.5 py-0.5 w-fit font-medium">
                          Source: {row.source}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-slate-500">{row.experience}</td>
                    <td className="py-3.5 px-3 font-bold text-emerald-600">{row.match}</td>
                    <td className="py-3.5 px-3">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${row.statusBg}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-500">{row.lastUpdated}</td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2 text-indigo-600">
                        <button
                          onClick={() => navigate(`/evaluation/${row.realId}`)}
                          className="p-1.5 hover:bg-slate-100 rounded-md transition-colors border border-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer"
                          title="View Candidate Full Evaluation Page"
                        >
                          <User size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (row.s3Url) {
                              const newWindow = window.open();
                              if (newWindow) {
                                newWindow.document.write(`
                                  <!DOCTYPE html>
                                  <html>
                                    <head>
                                      <title>Resume Preview</title>
                                      <style>
                                        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #ffffff; }
                                        iframe { width: 100%; height: 100%; border: none; }
                                      </style>
                                    </head>
                                    <body>
                                      <iframe src="${row.s3Url}"></iframe>
                                    </body>
                                  </html>
                                `);
                              } else {
                                window.location.href = row.s3Url;
                              }
                            } else {
                              alert("S3 Resume link is not available for this candidate.");
                            }
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded-md transition-colors border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                          title="Open PDF Resume Document (New Tab)"
                        >
                          <FileText size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-200 text-xs text-slate-500">
          <span>Showing 1 to {filteredCandidates.length} of {candidates.length} candidates</span>
        </div>
      </div>
    </div>
  );
}

