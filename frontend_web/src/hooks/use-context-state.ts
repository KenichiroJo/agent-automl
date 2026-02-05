/**
 * useContextState - Context パネルの状態管理と永続化
 *
 * プロジェクト・モデルの選択状態をlocalStorageに保存し、
 * ページリロード後も状態を復元します。
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import type { ProjectInfo, ModelInfo, RecentActivity } from '@/components/layout';

const STORAGE_KEY = 'datarobot-context-state';

interface ContextState {
  currentProject?: ProjectInfo;
  currentModel?: ModelInfo;
  recentActivities: RecentActivity[];
  projectList: ProjectInfo[];
  modelList: ModelInfo[];
}

interface UseContextStateReturn {
  // 現在の状態
  currentProject?: ProjectInfo;
  currentModel?: ModelInfo;
  recentActivities: RecentActivity[];
  projectList: ProjectInfo[];
  modelList: ModelInfo[];
  isLoadingProjects: boolean;
  isLoadingModels: boolean;

  // 選択アクション
  setCurrentProject: (project: ProjectInfo | undefined) => void;
  setCurrentModel: (model: ModelInfo | undefined) => void;

  // リスト更新アクション
  setProjectList: (projects: ProjectInfo[]) => void;
  setModelList: (models: ModelInfo[]) => void;

  // アクティビティ追加
  addActivity: (type: RecentActivity['type'], name: string) => void;

  // 状態リセット
  resetState: () => void;
}

/**
 * localStorageから状態を読み込み
 */
function loadState(): Partial<ContextState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load context state from localStorage:', e);
  }
  return {};
}

/**
 * localStorageに状態を保存
 */
function saveState(state: ContextState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save context state to localStorage:', e);
  }
}

export function useContextState(): UseContextStateReturn {
  const [currentProject, setCurrentProjectState] = useState<ProjectInfo | undefined>();
  const [currentModel, setCurrentModelState] = useState<ModelInfo | undefined>();
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [projectList, setProjectListState] = useState<ProjectInfo[]>([]);
  const [modelList, setModelListState] = useState<ModelInfo[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 初期化時にlocalStorageから復元
  useEffect(() => {
    const stored = loadState();
    if (stored.currentProject) setCurrentProjectState(stored.currentProject);
    if (stored.currentModel) setCurrentModelState(stored.currentModel);
    if (stored.recentActivities) setRecentActivities(stored.recentActivities);
    if (stored.projectList) setProjectListState(stored.projectList);
    if (stored.modelList) setModelListState(stored.modelList);
  }, []);

  // 状態が変わるたびにlocalStorageに保存
  useEffect(() => {
    saveState({
      currentProject,
      currentModel,
      recentActivities,
      projectList,
      modelList,
    });
  }, [currentProject, currentModel, recentActivities, projectList, modelList]);

  // プロジェクト選択
  const setCurrentProject = useCallback((project: ProjectInfo | undefined) => {
    setCurrentProjectState(project);
    // プロジェクトが変わったらモデルをリセット
    if (project?.id !== currentProject?.id) {
      setCurrentModelState(undefined);
      setModelListState([]);
    }
    // アクティビティに追加
    if (project) {
      setRecentActivities((prev) => {
        const newActivity: RecentActivity = {
          id: uuid(),
          type: 'project',
          name: project.name,
          timestamp: new Date().toLocaleTimeString(),
        };
        // 重複チェック（直近5件内に同じプロジェクト名があればスキップ）
        if (prev.slice(0, 5).some((a) => a.type === 'project' && a.name === project.name)) {
          return prev;
        }
        return [newActivity, ...prev.slice(0, 9)];
      });
    }
  }, [currentProject?.id]);

  // モデル選択
  const setCurrentModel = useCallback((model: ModelInfo | undefined) => {
    setCurrentModelState(model);
    // アクティビティに追加
    if (model) {
      setRecentActivities((prev) => {
        const newActivity: RecentActivity = {
          id: uuid(),
          type: 'model',
          name: model.name,
          timestamp: new Date().toLocaleTimeString(),
        };
        // 重複チェック
        if (prev.slice(0, 5).some((a) => a.type === 'model' && a.name === model.name)) {
          return prev;
        }
        return [newActivity, ...prev.slice(0, 9)];
      });
    }
  }, []);

  // プロジェクトリスト更新
  const setProjectList = useCallback((projects: ProjectInfo[]) => {
    setProjectListState(projects);
    setIsLoadingProjects(false);
  }, []);

  // モデルリスト更新
  const setModelList = useCallback((models: ModelInfo[]) => {
    setModelListState(models);
    setIsLoadingModels(false);
  }, []);

  // アクティビティ追加
  const addActivity = useCallback((type: RecentActivity['type'], name: string) => {
    setRecentActivities((prev) => {
      const newActivity: RecentActivity = {
        id: uuid(),
        type,
        name,
        timestamp: new Date().toLocaleTimeString(),
      };
      // 重複チェック
      if (prev.slice(0, 5).some((a) => a.type === type && a.name === name)) {
        return prev;
      }
      return [newActivity, ...prev.slice(0, 9)];
    });
  }, []);

  // 状態リセット
  const resetState = useCallback(() => {
    setCurrentProjectState(undefined);
    setCurrentModelState(undefined);
    setRecentActivities([]);
    setProjectListState([]);
    setModelListState([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    currentProject,
    currentModel,
    recentActivities,
    projectList,
    modelList,
    isLoadingProjects,
    isLoadingModels,
    setCurrentProject,
    setCurrentModel,
    setProjectList,
    setModelList,
    addActivity,
    resetState,
  };
}
