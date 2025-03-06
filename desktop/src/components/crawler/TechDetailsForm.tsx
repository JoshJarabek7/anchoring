import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DocumentationCategory } from "@/lib/db";

interface TechDetailsFormProps {
  onSubmit: (details: {
    category: DocumentationCategory;
    language?: string;
    languageVersion?: string;
    framework?: string;
    frameworkVersion?: string;
    library?: string;
    libraryVersion?: string;
  }) => void;
  onCancel: () => void;
}

export default function TechDetailsForm({
  onSubmit,
  onCancel,
}: TechDetailsFormProps) {
  const [category, setCategory] = useState<DocumentationCategory>(
    DocumentationCategory.LANGUAGE
  );
  const [language, setLanguage] = useState("");
  const [languageVersion, setLanguageVersion] = useState("");
  const [framework, setFramework] = useState("");
  const [frameworkVersion, setFrameworkVersion] = useState("");
  const [library, setLibrary] = useState("");
  const [libraryVersion, setLibraryVersion] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Construct the tech details object based on the selected category
    const details: {
      category: DocumentationCategory;
      language?: string;
      languageVersion?: string;
      framework?: string;
      frameworkVersion?: string;
      library?: string;
      libraryVersion?: string;
    } = { category };

    // Always include language for any category
    if (language) {
      details.language = language;
      if (languageVersion) details.languageVersion = languageVersion;
    }

    // Add framework details if category is framework or for library context
    if (category === DocumentationCategory.FRAMEWORK || 
        (category === DocumentationCategory.LIBRARY && framework)) {
      details.framework = framework;
      if (frameworkVersion) details.frameworkVersion = frameworkVersion;
    }

    // Add library details if category is library
    if (category === DocumentationCategory.LIBRARY) {
      details.library = library;
      if (libraryVersion) details.libraryVersion = libraryVersion;
    }

    onSubmit(details);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Technology Details</CardTitle>
        <CardDescription>
          Specify the programming language, framework, or library details
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Documentation Category</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as DocumentationCategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DocumentationCategory.LANGUAGE}>
                  Programming Language
                </SelectItem>
                <SelectItem value={DocumentationCategory.FRAMEWORK}>
                  Framework
                </SelectItem>
                <SelectItem value={DocumentationCategory.LIBRARY}>
                  Library
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">Programming Language</Label>
            <Input
              id="language"
              placeholder="e.g., Python, JavaScript"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="languageVersion">Language Version (optional)</Label>
            <Input
              id="languageVersion"
              placeholder="e.g., 3.10, ES2022"
              value={languageVersion}
              onChange={(e) => setLanguageVersion(e.target.value)}
            />
          </div>

          {(category === DocumentationCategory.FRAMEWORK ||
            category === DocumentationCategory.LIBRARY) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="framework">
                  {category === DocumentationCategory.FRAMEWORK
                    ? "Framework Name"
                    : "Framework (optional)"}
                </Label>
                <Input
                  id="framework"
                  placeholder="e.g., React, Django"
                  value={framework}
                  onChange={(e) => setFramework(e.target.value)}
                  required={category === DocumentationCategory.FRAMEWORK}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="frameworkVersion">
                  Framework Version (optional)
                </Label>
                <Input
                  id="frameworkVersion"
                  placeholder="e.g., 18.2.0, 4.2"
                  value={frameworkVersion}
                  onChange={(e) => setFrameworkVersion(e.target.value)}
                />
              </div>
            </>
          )}

          {category === DocumentationCategory.LIBRARY && (
            <>
              <div className="space-y-2">
                <Label htmlFor="library">Library Name</Label>
                <Input
                  id="library"
                  placeholder="e.g., lodash, pandas"
                  value={library}
                  onChange={(e) => setLibrary(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="libraryVersion">
                  Library Version (optional)
                </Label>
                <Input
                  id="libraryVersion"
                  placeholder="e.g., 4.17.21, 2.0.3"
                  value={libraryVersion}
                  onChange={(e) => setLibraryVersion(e.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">Save Details</Button>
        </CardFooter>
      </form>
    </Card>
  );
}