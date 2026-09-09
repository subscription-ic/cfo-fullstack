import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ArrowLeft, FileText, Loader2, Building2, Eye, Download, Trash2 } from 'lucide-react';
import {
  fetchCompanies,
  fetchDocumentCatalog,
  fetchDocumentDownloadUrl,
  deleteDocument,
  fetchPredictedQuestions,
  fetchActualEarningsQA,
  getAccessToken,
  type DocumentCatalogRow,
  type ActualEarningsQARow,
} from '../utils/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { FiscalPeriodBadge } from '../components/FiscalPeriodBadge';

const ALL = '__all__';

/** Read-only view of a company and the documents ingested for it.
 *  Uploading and deleting stay in the Admin Panel by design. */
export default function CompanyDetails() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [docs, setDocs] = useState<DocumentCatalogRow[]>([]);
  const [predictedCount, setPredictedCount] = useState<number | null>(null);
  const [actualCount, setActualCount] = useState<number | null>(null);
  const [actualRows, setActualRows] = useState<ActualEarningsQARow[]>([]);
  const [pendingDelete, setPendingDelete] = useState<DocumentCatalogRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const token = getAccessToken();
    Promise.all([
      fetchCompanies().catch(() => [] as string[]),
      token ? fetchDocumentCatalog(token).catch(() => [] as DocumentCatalogRow[]) : Promise.resolve([]),
    ])
      .then(([names, rows]) => {
        if (cancelled) return;
        setCompanies(names);
        setDocs(rows);
        setSelectedCompany((prev) => prev || names[0] || '');
        if (!token) setError('Sign in again to load the document list.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Q&A coverage for the selected company — this is what exists even when no
  // documents have been ingested.
  useEffect(() => {
    if (!selectedCompany || selectedCompany === ALL) return;
    let cancelled = false;
    fetchPredictedQuestions(selectedCompany)
      .then((r) => !cancelled && setPredictedCount(r.length))
      .catch(() => !cancelled && setPredictedCount(null));
    fetchActualEarningsQA(selectedCompany)
      .then((r) => {
        if (cancelled) return;
        setActualCount(r.length);
        setActualRows(r);
      })
      .catch(() => !cancelled && setActualCount(null));
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const showingAll = selectedCompany === ALL;

  const companyDocs = useMemo(
    () =>
      docs
        .filter((d) =>
          showingAll || (d.company || '').toLowerCase().includes(selectedCompany.toLowerCase()))
        .sort((a, b) => (a.fiscal_year === b.fiscal_year
          ? (b.quarter || '').localeCompare(a.quarter || '')
          : b.fiscal_year - a.fiscal_year)),
    [docs, selectedCompany, showingAll],
  );

  const periods = useMemo(
    () => new Set(companyDocs.map((d) => `${d.quarter} FY${d.fiscal_year}`)),
    [companyDocs],
  );

  const [busyDoc, setBusyDoc] = useState<string | null>(null);

  /** Ask the backend for a short-lived signed URL, then either open it in a new
   *  tab or hand it to the browser as a download. Nothing is modified. */
  const openDoc = async (id: string, filename: string, mode: 'view' | 'download') => {
    const token = getAccessToken();
    if (!token) return;
    setBusyDoc(id);
    try {
      const url = await fetchDocumentDownloadUrl(id, token);
      if (mode === 'view') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'document';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      setError('Could not open that document. Try again.');
    } finally {
      setBusyDoc(null);
    }
  };

  /** Q&A rows extracted from this document — they are removed with it.
   *  Migrated Q&A has no source_document_id, so it is never affected. */
  const linkedQaCount = (docId: string) =>
    actualRows.filter((r) => r.source_document_id === docId).length;

  const confirmDelete = async () => {
    const doc = pendingDelete;
    const token = getAccessToken();
    if (!doc || !token) return;
    setDeleting(true);
    try {
      await deleteDocument(doc.id, token);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success('Document deleted', {
        description: doc.original_filename || 'Document removed.',
      });
      setPendingDelete(null);
      // refresh Q&A counts, which the cascade may have changed
      if (selectedCompany && selectedCompany !== ALL) {
        fetchActualEarningsQA(selectedCompany)
          .then((r) => {
            setActualCount(r.length);
            setActualRows(r);
          })
          .catch(() => undefined);
      }
    } catch {
      toast.error('Delete failed', { description: 'The document was not removed.' });
    } finally {
      setDeleting(false);
    }
  };

  const stat = (label: string, value: string) => (
    <div className="rounded-lg border border-[var(--acu-border)] bg-white px-4 py-3">
      <div className="text-[0.7rem] font-medium uppercase tracking-[0.09em] text-[var(--acu-ink3)]">
        {label}
      </div>
      <div className="acu-num mt-1 text-[1.6rem] leading-none text-[var(--acu-ink)]">{value}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-[1700px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate('/dashboard')}
              className="mb-3 text-[1.05rem] text-[var(--acu-accent2)] hover:text-[var(--acu-accent2)] hover:bg-[var(--acu-accent-pale)] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-semibold text-[#a01419] mb-2">Company Details</h1>
            <p className="text-slate-600">
              Companies on record and the documents ingested for them
            </p>
            {companies.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-700">Company:</span>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger className="w-[240px] border-[var(--acu-accent2)] bg-white text-[var(--acu-ink)] font-medium">
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All companies</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#a01419]" />
          </div>
        ) : (
          <>
            {/* At-a-glance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-600">
                  <Building2 className="w-4 h-4 text-[#a01419]" />
                  {showingAll ? 'All companies' : selectedCompany || 'No company on record'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {stat('Documents', String(companyDocs.length))}
                  {stat('Periods covered', String(periods.size))}
                  {stat(
                    showingAll ? 'Companies' : 'Predicted questions',
                    showingAll
                      ? String(companies.length)
                      : predictedCount === null ? '—' : String(predictedCount),
                  )}
                  {stat(
                    showingAll ? 'Companies with docs' : 'Actual Q&A',
                    showingAll
                      ? String(new Set(companyDocs.map((d) => d.company)).size)
                      : actualCount === null ? '—' : String(actualCount),
                  )}
                </div>
                {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-[#a01419]">
                  <FileText className="w-5 h-5" />
                  Ingested documents
                </CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Read-only. Uploading and deleting documents is done in the Admin Panel.
                </p>
              </CardHeader>
              <CardContent>
                {companyDocs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--acu-border)] bg-slate-50/60 px-4 py-6 text-sm text-slate-600">
                    No documents have been ingested for{' '}
                    <strong>{showingAll ? 'any company' : selectedCompany || 'this company'}</strong> yet. Q&amp;A data can still
                    exist without them — see the counts above.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {showingAll && <TableHead>Company</TableHead>}
                        <TableHead>File</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Ingested</TableHead>
                        <TableHead className="text-right">File</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companyDocs.map((d) => (
                        <TableRow key={d.id}>
                          {showingAll && (
                            <TableCell className="text-slate-700">{d.company}</TableCell>
                          )}
                          <TableCell className="font-medium text-slate-900">
                            {d.original_filename || d.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="border-[var(--acu-accent2)]/40 text-[var(--acu-accent2)]"
                            >
                              {(d.document_type || '').replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <span>
                                {d.quarter} FY{String(d.fiscal_year).slice(-2)}
                              </span>
                              <FiscalPeriodBadge
                                company={d.company}
                                quarter={d.quarter}
                                fiscalYear={d.fiscal_year}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {new Date(d.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyDoc === d.id}
                                onClick={() => openDoc(d.id, d.original_filename || '', 'view')}
                                className="h-8 px-3 border-[var(--acu-accent2)]/40 text-[var(--acu-accent2)] hover:bg-[var(--acu-accent-pale)] cursor-pointer"
                              >
                                {busyDoc === d.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyDoc === d.id}
                                onClick={() => openDoc(d.id, d.original_filename || '', 'download')}
                                className="h-8 px-3 border-[var(--acu-accent2)]/40 text-[var(--acu-accent2)] hover:bg-[var(--acu-accent-pale)] cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                Download
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPendingDelete(d)}
                                className="h-8 px-3 border-[var(--acu-accent2)]/40 text-[var(--acu-accent2)] hover:bg-[var(--acu-accent2)] hover:text-white cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Deleting a document cascades on the backend, so spell out exactly
            what goes with it before asking for confirmation. */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(o) => !o && setPendingDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this document?</AlertDialogTitle>
              {/* Description stays a single line of text: it renders a <p>,
                  so lists/divs must live outside it (invalid nesting + a
                  Radix ref warning otherwise). */}
              <AlertDialogDescription>
                {pendingDelete?.original_filename || 'Document'} — this permanently
                removes, and cannot be undone:
              </AlertDialogDescription>
              <div className="space-y-3 text-sm text-slate-600">
                <ul className="list-disc pl-5 space-y-1">
                    <li>the stored file</li>
                    <li>its text chunks and embeddings</li>
                    <li>any cached analysis for it</li>
                    <li>
                      {pendingDelete && linkedQaCount(pendingDelete.id) > 0 ? (
                        <span className="font-medium text-[var(--acu-accent2)]">
                          {linkedQaCount(pendingDelete.id)} analyst Q&amp;A row
                          {linkedQaCount(pendingDelete.id) === 1 ? '' : 's'} extracted from
                          this document
                        </span>
                      ) : (
                        'no extracted Q&A (nothing was extracted from this document)'
                      )}
                    </li>
                </ul>
                <p className="text-slate-500">
                  Predicted questions and Q&amp;A that did not come from this document are
                  not affected.
                </p>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="cursor-pointer" disabled={deleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmDelete();
                }}
                disabled={deleting}
                className="bg-[var(--acu-accent2)] hover:bg-[var(--acu-accent)] text-white cursor-pointer"
              >
                {deleting ? 'Deleting…' : 'Delete document'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
