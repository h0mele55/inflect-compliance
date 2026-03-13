/**
 * @deprecated Use WorkItemRepository instead. This file re-exports for backward compatibility.
 */
import { WorkItemRepository, TaskLinkRepository, TaskCommentRepository, TaskWatcherRepository } from './WorkItemRepository';
import type { TaskFilters } from './WorkItemRepository';

/** @deprecated Use TaskFilters */
export type IssueFilters = TaskFilters;
/** @deprecated Use WorkItemRepository */
export const IssueRepository = WorkItemRepository;
/** @deprecated Use TaskLinkRepository */
export const IssueLinkRepository = TaskLinkRepository;
/** @deprecated Use TaskCommentRepository */
export const IssueCommentRepository = TaskCommentRepository;
/** @deprecated Use TaskWatcherRepository */
export const IssueWatcherRepository = TaskWatcherRepository;
