import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetchAndSaveProxies, getProxies } from "../../lib/db";

import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Badge } from "../ui/badge";

export default function ProxySettings() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [proxies, setProxies] = useState<{ id?: number; url: string; last_used?: string; status: string }[]>([]);

  const loadProxies = async () => {
    try {
      setLoading(true);
      const data = await getProxies();
      setProxies(data);
    } catch (error) {
      console.error("Failed to load proxies:", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshProxies = async () => {
    try {
      setRefreshing(true);
      const proxyList = await invoke<string[]>("fetch_proxies");
      const updatedProxies = await fetchAndSaveProxies(proxyList);
      setProxies(updatedProxies);
    } catch (error) {
      console.error("Failed to refresh proxies:", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadProxies();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proxy Settings</CardTitle>
        <CardDescription>Manage proxies for web crawling.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Proxy List</h3>
              <p className="text-sm text-gray-500">
                {proxies.length} proxies available
              </p>
            </div>
            <Button
              onClick={refreshProxies}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh Proxies"}
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-4">Loading proxies...</div>
          ) : proxies.length === 0 ? (
            <div className="text-center py-4">
              No proxies available. Click "Refresh Proxies" to fetch the proxy list.
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proxy URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proxies.slice(0, 10).map((proxy) => (
                    <TableRow key={proxy.id}>
                      <TableCell className="font-mono">{proxy.url}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            proxy.status === "active"
                              ? "default"
                              : proxy.status === "error"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {proxy.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {proxy.last_used
                          ? new Date(proxy.last_used).toLocaleString()
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {proxies.length > 10 && (
                <div className="text-center p-2 text-sm text-gray-500">
                  Showing 10 of {proxies.length} proxies
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-sm text-gray-500">
          Proxies are automatically rotated during web crawling
        </div>
      </CardFooter>
    </Card>
  );
}