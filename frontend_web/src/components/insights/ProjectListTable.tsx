/**
 * Project List Table Component
 *
 * DataRobotプロジェクト一覧を表示するテーブルコンポーネント。
 * 検索・ソート機能を提供します。
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Search, ArrowUpDown, FolderOpen, Calendar, Database } from 'lucide-react';

export interface Project {
  id: string;
  name: string;
  created?: string;
  updated?: string;
  targetVariable?: string;
  status?: string;
  modelCount?: number;
}

export interface ProjectListTableProps {
  projects: Project[];
  onProjectSelect?: (project: Project) => void;
  className?: string;
}

type SortField = 'name' | 'created' | 'updated';
type SortOrder = 'asc' | 'desc';

function getStatusColor(status?: string): string {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'complete':
      return 'bg-green-500/20 text-green-400 border-green-500/50';
    case 'running':
    case 'inprogress':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'error':
    case 'failed':
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
  }
}

function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function ProjectListTable({
  projects,
  onProjectSelect,
  className,
}: ProjectListTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const filteredAndSortedProjects = useMemo(() => {
    let filtered = projects;

    // 検索フィルタ
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = projects.filter(
        p =>
          p.name.toLowerCase().includes(query) ||
          p.targetVariable?.toLowerCase().includes(query)
      );
    }

    // ソート
    return [...filtered].sort((a, b) => {
      let aVal: string | undefined;
      let bVal: string | undefined;

      switch (sortField) {
        case 'name':
          aVal = a.name;
          bVal = b.name;
          break;
        case 'created':
          aVal = a.created;
          bVal = b.created;
          break;
        case 'updated':
          aVal = a.updated;
          bVal = b.updated;
          break;
      }

      if (!aVal) return sortOrder === 'asc' ? 1 : -1;
      if (!bVal) return sortOrder === 'asc' ? -1 : 1;

      const comparison = aVal.localeCompare(bVal);
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [projects, searchQuery, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <Card className={cn('bg-gray-800 border-gray-700', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <div className="w-1 h-6 bg-[#81FBA5]" />
            プロジェクト一覧
            <Badge variant="secondary" className="bg-gray-700 text-gray-200 ml-2">
              {filteredAndSortedProjects.length} / {projects.length}
            </Badge>
          </CardTitle>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="プロジェクト名で検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th
                  className="text-left py-3 px-2 text-gray-400 font-medium cursor-pointer hover:text-white"
                  onClick={() => toggleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    <FolderOpen className="w-4 h-4" />
                    プロジェクト名
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="text-left py-3 px-2 text-gray-400 font-medium">
                  <div className="flex items-center gap-1">
                    <Database className="w-4 h-4" />
                    ターゲット
                  </div>
                </th>
                <th
                  className="text-left py-3 px-2 text-gray-400 font-medium cursor-pointer hover:text-white"
                  onClick={() => toggleSort('updated')}
                >
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    更新日
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="text-left py-3 px-2 text-gray-400 font-medium">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedProjects.map(project => (
                <tr
                  key={project.id}
                  className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors"
                  onClick={() => onProjectSelect?.(project)}
                >
                  <td className="py-3 px-2">
                    <div className="text-white font-medium truncate max-w-[300px]" title={project.name}>
                      {project.name}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">{project.id.slice(0, 8)}...</div>
                  </td>
                  <td className="py-3 px-2 text-gray-300">
                    {project.targetVariable || '-'}
                  </td>
                  <td className="py-3 px-2 text-gray-300">
                    {formatDate(project.updated)}
                  </td>
                  <td className="py-3 px-2">
                    <Badge className={cn('text-xs', getStatusColor(project.status))}>
                      {project.status || 'Unknown'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAndSortedProjects.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              {searchQuery ? '検索結果がありません' : 'プロジェクトがありません'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ProjectListTable;
