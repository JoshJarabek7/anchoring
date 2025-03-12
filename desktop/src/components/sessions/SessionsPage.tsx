import { useState, useEffect } from "react";
import SessionList from "./SessionList";
import CreateSessionForm from "./CreateSessionForm";
import { CrawlSession, getSession } from "../../lib/db";
import { Alert, AlertDescription } from "../../components/ui/alert";

interface SessionsPageProps {
  onSelectSession: (session: CrawlSession) => void;
}

export default function SessionsPage({ onSelectSession }: SessionsPageProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  useEffect(() => {
    async function loadSelectedSession() {
      try {
        const session = await getSession(1); // Get the first session or use a different method
        if (session) {
          setSelectedSessionId(session.id!);
        }
      } catch (error) {
        console.error("Error loading session:", error);
      }
    }
    
    loadSelectedSession();
  }, []);
  
  const handleCreateSession = () => {
    setIsCreating(true);
  };
  
  const handleSessionCreated = (session: CrawlSession) => {
    setIsCreating(false);
    setSelectedSessionId(session.id!);
    onSelectSession(session);
  };
  
  const handleCancel = () => {
    setIsCreating(false);
  };
  
  const handleSelectSession = (session: CrawlSession) => {
    setSelectedSessionId(session.id!);
    onSelectSession(session);
  };
  
  return (
    <div>
      {isCreating ? (
        <CreateSessionForm 
          onSessionCreated={handleSessionCreated}
          onCancel={handleCancel}
        />
      ) : (
        <SessionList 
          onCreateSession={handleCreateSession}
          onSelectSession={handleSelectSession}
        />
      )}
    </div>
  );
}