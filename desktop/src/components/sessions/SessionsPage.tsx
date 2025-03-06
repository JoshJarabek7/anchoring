import { useState } from "react";
import SessionList from "./SessionList";
import CreateSessionForm from "./CreateSessionForm";
import { CrawlSession } from "../../lib/db";

interface SessionsPageProps {
  chromaPath: string;
  onSelectSession: (session: CrawlSession) => void;
}

export default function SessionsPage({ chromaPath, onSelectSession }: SessionsPageProps) {
  const [isCreating, setIsCreating] = useState(false);
  
  const handleCreateSession = () => {
    setIsCreating(true);
  };
  
  const handleSessionCreated = (session: CrawlSession) => {
    setIsCreating(false);
    onSelectSession(session);
  };
  
  const handleCancel = () => {
    setIsCreating(false);
  };
  
  return (
    <div>
      {isCreating ? (
        <CreateSessionForm 
          chromaPath={chromaPath}
          onSessionCreated={handleSessionCreated}
          onCancel={handleCancel}
        />
      ) : (
        <SessionList 
          onCreateSession={handleCreateSession}
          onSelectSession={onSelectSession}
        />
      )}
    </div>
  );
}