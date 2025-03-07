import { useState, useEffect, useRef } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "../ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "../ui/button";
import { Trash2, Copy, Download, Upload } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { getSessions, CrawlSession, deleteSession, duplicateSession, exportSession, importSession } from "../../lib/db";

interface SessionListProps {
  onCreateSession: () => void;
  onSelectSession: (session: CrawlSession) => void;
}

export default function SessionList({ onCreateSession, onSelectSession }: SessionListProps) {
  const [sessions, setSessions] = useState<CrawlSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await getSessions();
      setSessions(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load sessions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleDelete = (sessionId: number) => {
    setSessionToDelete(sessionId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (sessionToDelete !== null) {
      try {
        await deleteSession(sessionToDelete);
        toast.success("Session deleted successfully");
        // Reload the sessions list
        await loadSessions();
      } catch (error) {
        console.error("Error deleting session:", error);
        toast.error("Failed to delete session");
      } finally {
        setDeleteDialogOpen(false);
        setSessionToDelete(null);
      }
    }
  };

  const handleDuplicate = async (sessionId: number) => {
    try {
      await duplicateSession(sessionId);
      toast.success("Session duplicated successfully");
      // Reload the sessions list
      await loadSessions();
    } catch (error) {
      console.error("Error duplicating session:", error);
      toast.error("Failed to duplicate session");
    }
  };

  const handleExport = async (sessionId: number) => {
    try {
      const exportData = await exportSession(sessionId);
      
      // Convert to JSON string
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Create a blob and download link
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create a temporary link and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${sessionId}-export.json`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Session exported successfully");
    } catch (error) {
      console.error("Error exporting session:", error);
      toast.error("Failed to export session");
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      // Read the file
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const importData = JSON.parse(content);
          
          // Import the session
          await importSession(importData);
          
          toast.success("Session imported successfully");
          
          // Reload the sessions list
          await loadSessions();
        } catch (error) {
          console.error("Error parsing import file:", error);
          toast.error("Failed to import session: Invalid file format");
        }
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error("Error importing session:", error);
      toast.error("Failed to import session");
    } finally {
      // Reset the file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Crawl Sessions</CardTitle>
          <CardDescription>Manage your documentation crawl sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading sessions...</div>
          ) : error ? (
            <div className="text-red-500 py-4">{error}</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-4">No sessions yet. Create a new session to start crawling.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{session.title}</TableCell>
                    <TableCell>{session.version || "N/A"}</TableCell>
                    <TableCell>{new Date(session.created_at!).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => onSelectSession(session)}
                        >
                          Select
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleExport(session.id!)}
                          title="Export session"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(session.id!)}
                          title="Duplicate session"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(session.id!)}
                          className="text-red-500 hover:text-red-700"
                          title="Delete session"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button onClick={onCreateSession}>New Session</Button>
          <Button variant="outline" onClick={handleImportClick}>
            <Upload className="h-4 w-4 mr-2" />
            Import Session
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".json"
            style={{ display: 'none' }}
          />
        </CardFooter>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the session and all of its URLs, settings, and other data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}