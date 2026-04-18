/**
 * Control usecase barrel export.
 *
 * All public functions are re-exported here so existing imports
 * from '@/app-layer/usecases/control' continue to work unchanged.
 */
export {
    listControls,
    listControlsPaginated,
    getControl,
    getControlActivity,
    getControlDashboard,
    runConsistencyCheck,
    listControlsWithDeleted,
} from './queries';

export {
    createControl,
    updateControl,
    setControlStatus,
    setControlApplicability,
    setControlOwner,
    markControlTestCompleted,
    deleteControl,
    restoreControl,
    purgeControl,
} from './mutations';

export {
    listControlTasks,
    createControlTask,
    updateControlTask,
    deleteControlTask,
} from './tasks';

export {
    listEvidenceLinks,
    linkEvidence,
    unlinkEvidence,
    linkAssetToControl,
    unlinkAssetFromControl,
    listContributors,
    addContributor,
    removeContributor,
} from './evidence';

export {
    listControlTemplates,
    installControlsFromTemplate,
    listFrameworks,
    listFrameworkRequirements,
    mapRequirementToControl,
    unmapRequirementFromControl,
} from './templates';
