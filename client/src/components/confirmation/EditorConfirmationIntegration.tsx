/**
 * Editor Confirmation Integration
 *
 * Provides seamless confirmation integration for SiteSpeak's website editor
 * Handles page deletion, component removal, publishing, and other destructive actions
 */

import { useEffect, useCallback } from 'react';
import { useConfirmation } from '@/hooks/useConfirmation';
import { voiceActionConfirmationIntegration } from '@/services/confirmation/VoiceActionConfirmationIntegration';
import { useDispatch, useSelector } from 'react-redux';
import { useToast } from '@/components/ui/Toast';

// Window interface extension for editor confirmations
declare global {
  interface Window {
    editorConfirmations?: {
      deletePage: (pageId: string, pageName: string) => Promise<boolean>;
      deleteComponent: (componentId: string, componentName: string, componentType: string) => Promise<boolean>;
      publishSite: () => Promise<boolean>;
      unpublishSite: () => Promise<boolean>;
      clearPage: () => Promise<boolean>;
      resetChanges: () => Promise<boolean>;
    };
  }
}

interface EditorAction {
  type: 'delete_page' | 'delete_component' | 'publish_site' | 'unpublish_site' | 'clear_page' | 'reset_changes';
  target?: {
    id: string;
    name: string;
    type?: string;
  };
  targetId?: string;
  targetName?: string;
  context?: Record<string, unknown>;
}

interface EditorState {
  currentPage?: {
    id: string;
    name: string;
    isPublished: boolean;
  };
  currentSite?: {
    id: string;
    name: string;
    isPublished: boolean;
  };
  hasUnsavedChanges: boolean;
  selectedComponent?: {
    id: string;
    type: string;
    name: string;
  };
}

export function EditorConfirmationIntegration() {
  const dispatch = useDispatch();
  const editorState = useSelector((state: any) => state.editor) as EditorState;
  const { confirmDelete, confirmPublish, confirm } = useConfirmation();
  const { addToast } = useToast();

  // Initialize voice integration
  useEffect(() => {
    voiceActionConfirmationIntegration.initialize().catch(error => {
      console.warn('Voice confirmation integration failed to initialize:', error);
    });
  }, []);

  // Enhanced delete page function with confirmation
  const deletePageWithConfirmation = useCallback(async (pageId: string, pageName: string) => {
    try {
      const response = await confirmDelete(
        { id: pageId, name: pageName, type: 'page' },
        {
          recoverable: false,
          dependencies: [] // Would be populated with actual dependencies
        }
      );

      if (response.action === 'confirm') {
        // Dispatch actual delete action
        dispatch({ type: 'DELETE_PAGE', payload: { pageId } });

        addToast({
          type: 'success',
          title: `Page "${pageName}" deleted successfully`,
          duration: 4000
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Page deletion confirmation failed:', error);
      addToast({
        type: 'error',
        title: 'Failed to delete page'
      });
      return false;
    }
  }, [confirmDelete, dispatch, addToast]);

  // Enhanced component deletion with confirmation
  const deleteComponentWithConfirmation = useCallback(async (
    componentId: string,
    componentName: string,
    componentType: string
  ) => {
    try {
      const response = await confirmDelete(
        { id: componentId, name: componentName, type: 'component' },
        {
          recoverable: true, // Components can usually be restored
          dependencies: [] // Would check for dependencies
        }
      );

      if (response.action === 'confirm') {
        dispatch({
          type: 'DELETE_COMPONENT',
          payload: { componentId, pageId: editorState.currentPage?.id }
        });

        addToast({
          type: 'success',
          title: `${componentType} component deleted`,
          duration: 3000
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Component deletion confirmation failed:', error);
      addToast({
        type: 'error',
        title: 'Failed to delete component'
      });
      return false;
    }
  }, [confirmDelete, dispatch, editorState.currentPage?.id, addToast]);

  // Site publishing with confirmation
  const publishSiteWithConfirmation = useCallback(async () => {
    if (!editorState.currentSite) {return false;}

    try {
      const response = await confirmPublish(
        { id: editorState.currentSite.id, name: editorState.currentSite.name },
        { makePublic: true }
      );

      if (response.action === 'confirm') {
        dispatch({
          type: 'PUBLISH_SITE',
          payload: { siteId: editorState.currentSite.id }
        });

        addToast({
          type: 'success',
          title: 'Site published successfully! 🚀',
          duration: 5000
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Site publishing confirmation failed:', error);
      addToast({
        type: 'error',
        title: 'Failed to publish site'
      });
      return false;
    }
  }, [confirmPublish, dispatch, editorState.currentSite, addToast]);

  // Unpublish site with confirmation
  const unpublishSiteWithConfirmation = useCallback(async () => {
    if (!editorState.currentSite) {return false;}

    try {
      const response = await confirm({
        title: 'Unpublish Site',
        description: `Take "${editorState.currentSite.name}" offline? Visitors will no longer be able to access it.`,
        context: {
          type: 'unpublish',
          targetType: 'site',
          targetId: editorState.currentSite.id,
          targetName: editorState.currentSite.name,
          recoverable: true,
          estimatedImpact: 'significant'
        },
        riskLevel: 'high',
        warnings: [
          'Site will be immediately inaccessible to visitors',
          'All traffic to this site will see an error page',
          'You can republish at any time'
        ]
      });

      if (response.action === 'confirm') {
        dispatch({
          type: 'UNPUBLISH_SITE',
          payload: { siteId: editorState.currentSite.id }
        });

        addToast({
          type: 'success',
          title: 'Site unpublished',
          duration: 4000
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Site unpublishing confirmation failed:', error);
      addToast({
        type: 'error',
        title: 'Failed to unpublish site'
      });
      return false;
    }
  }, [confirm, dispatch, editorState.currentSite, addToast]);

  // Clear entire page with confirmation
  const clearPageWithConfirmation = useCallback(async () => {
    if (!editorState.currentPage) {return false;}

    try {
      const response = await confirm({
        title: 'Clear Page',
        description: `Remove all components from "${editorState.currentPage.name}"? This will delete all content on this page.`,
        context: {
          type: 'delete',
          targetType: 'page',
          targetId: editorState.currentPage.id,
          targetName: editorState.currentPage.name,
          recoverable: false,
          estimatedImpact: 'severe'
        },
        riskLevel: 'critical',
        warnings: [
          'All components on this page will be permanently deleted',
          'Page layout and content will be lost',
          'This action cannot be undone'
        ],
        confirmationPhrase: editorState.currentPage.name
      });

      if (response.action === 'confirm') {
        dispatch({
          type: 'CLEAR_PAGE',
          payload: { pageId: editorState.currentPage.id }
        });

        addToast({
          type: 'success',
          title: 'Page cleared',
          duration: 3000
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Page clearing confirmation failed:', error);
      addToast({
        type: 'error',
        title: 'Failed to clear page'
      });
      return false;
    }
  }, [confirm, dispatch, editorState.currentPage, addToast]);

  // Reset unsaved changes with confirmation
  const resetChangesWithConfirmation = useCallback(async () => {
    if (!editorState.hasUnsavedChanges) {return true;}

    try {
      const response = await confirm({
        title: 'Discard Changes',
        description: 'You have unsaved changes. Are you sure you want to discard them?',
        context: {
          type: 'modify',
          targetType: 'page',
          targetId: editorState.currentPage?.id || 'unknown',
          targetName: editorState.currentPage?.name || 'Current page',
          recoverable: false,
          estimatedImpact: 'moderate'
        },
        riskLevel: 'medium',
        warnings: [
          'All unsaved changes will be lost',
          'Page will revert to last saved state'
        ]
      });

      if (response.action === 'confirm') {
        dispatch({ type: 'RESET_CHANGES' });

        addToast({
          type: 'success',
          title: 'Changes discarded',
          duration: 3000
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Reset changes confirmation failed:', error);
      return false;
    }
  }, [confirm, dispatch, editorState.hasUnsavedChanges, editorState.currentPage]);

  // Expose confirmation functions to global scope for use by other components
  useEffect(() => {
    const editorConfirmations = {
      deletePage: deletePageWithConfirmation,
      deleteComponent: deleteComponentWithConfirmation,
      publishSite: publishSiteWithConfirmation,
      unpublishSite: unpublishSiteWithConfirmation,
      clearPage: clearPageWithConfirmation,
      resetChanges: resetChangesWithConfirmation
    };

    // Attach to window for global access
    window.editorConfirmations = editorConfirmations;

    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('editor_confirmations_ready', {
      detail: editorConfirmations
    }));

    return () => {
      delete window.editorConfirmations;
    };
  }, [
    deletePageWithConfirmation,
    deleteComponentWithConfirmation,
    publishSiteWithConfirmation,
    unpublishSiteWithConfirmation,
    clearPageWithConfirmation,
    resetChangesWithConfirmation
  ]);

  // Handle voice commands for editor actions
  useEffect(() => {
    const handleVoiceCommand = async (event: Event) => {
    // Type guard to ensure event is CustomEvent
    if (!(event instanceof CustomEvent)) {
      console.warn('Expected CustomEvent but received:', event.type);
      return;
    }
      const { command, confidence, context } = event.detail;

      try {
        // Create voice action object
        const voiceAction = {
          id: `voice_${Date.now()}`,
          type: inferActionType(command),
          command,
          target: context?.target,
          confidence,
          context
        };

        // Intercept and get confirmation if needed
        const result = await voiceActionConfirmationIntegration.interceptVoiceAction(voiceAction);

        if (result.shouldProceed && result.modifiedAction) {
          // Execute the appropriate editor action
          const editorAction = convertVoiceActionToEditorAction(result.modifiedAction);
          await executeEditorAction(editorAction);
        }

      } catch (error) {
        console.error('Voice command confirmation failed:', error);
        addToast({
          type: 'error',
          title: 'Voice command failed'
        });
      }
    };

    window.addEventListener('voice_command_received', handleVoiceCommand);

    return () => {
      window.removeEventListener('voice_command_received', handleVoiceCommand);
    };
  }, [addToast]);

  // Helper function to infer action type from voice command
  const inferActionType = (command: string): 'navigate' | 'delete' | 'modify' | 'create' | 'publish' | 'unpublish' => {
    command = command.toLowerCase();

    if (command.includes('delete') || command.includes('remove') || command.includes('clear')) {
      return 'delete';
    }

    if (command.includes('publish')) {return 'publish';}
    if (command.includes('unpublish')) {return 'unpublish';}
    if (command.includes('create') || command.includes('add')) {return 'create';}
    if (command.includes('navigate') || command.includes('go to')) {return 'navigate';}

    return 'modify';
  };

  // Helper function to convert VoiceAction to EditorAction
  const convertVoiceActionToEditorAction = (voiceAction: any): EditorAction => {
    const baseAction: EditorAction = {
      type: 'reset_changes', // default - closest to generic "modify" action
      target: voiceAction.target,
      targetId: voiceAction.target?.id,
      targetName: voiceAction.target?.name,
      context: voiceAction.context
    };

    // Map VoiceAction types to EditorAction types based on command content
    if (voiceAction.type === 'delete') {
      if (voiceAction.command?.toLowerCase().includes('page')) {
        baseAction.type = 'delete_page';
      } else if (voiceAction.command?.toLowerCase().includes('component')) {
        baseAction.type = 'delete_component';
      } else if (voiceAction.command?.toLowerCase().includes('clear')) {
        baseAction.type = 'clear_page';
      }
    } else if (voiceAction.type === 'publish') {
      baseAction.type = 'publish_site';
    } else if (voiceAction.type === 'unpublish') {
      baseAction.type = 'unpublish_site';
    } else if (voiceAction.type === 'modify' && voiceAction.command?.toLowerCase().includes('reset')) {
      baseAction.type = 'reset_changes';
    }

    return baseAction;
  };

  // Execute editor action based on voice command
  const executeEditorAction = async (action: EditorAction) => {
    switch (action.type) {
      case 'delete_page':
        if (action.target?.id && action.target?.name) {
          await deletePageWithConfirmation(action.target.id, action.target.name);
        }
        break;

      case 'delete_component':
        if (action.target?.id && action.target?.name) {
          await deleteComponentWithConfirmation(
            action.target.id,
            action.target.name,
            action.target.type || 'component'
          );
        }
        break;

      case 'publish_site':
        await publishSiteWithConfirmation();
        break;

      case 'unpublish_site':
        await unpublishSiteWithConfirmation();
        break;

      case 'clear_page':
        await clearPageWithConfirmation();
        break;

      case 'reset_changes':
        await resetChangesWithConfirmation();
        break;

      default:
        console.warn('Unknown editor action type:', action.type);
    }
  };

  // This component doesn't render anything - it's purely for integration
  return null;
}

// Hook for using editor confirmations in components
export function useEditorConfirmations() {
  const deletePage = useCallback((pageId: string, pageName: string) => {
    return window.editorConfirmations?.deletePage(pageId, pageName) || Promise.resolve(false);
  }, []);

  const deleteComponent = useCallback((componentId: string, componentName: string, componentType: string) => {
    return window.editorConfirmations?.deleteComponent(componentId, componentName, componentType) || Promise.resolve(false);
  }, []);

  const publishSite = useCallback(() => {
    return window.editorConfirmations?.publishSite() || Promise.resolve(false);
  }, []);

  const unpublishSite = useCallback(() => {
    return window.editorConfirmations?.unpublishSite() || Promise.resolve(false);
  }, []);

  const clearPage = useCallback(() => {
    return window.editorConfirmations?.clearPage() || Promise.resolve(false);
  }, []);

  const resetChanges = useCallback(() => {
    return window.editorConfirmations?.resetChanges() || Promise.resolve(false);
  }, []);

  return {
    deletePage,
    deleteComponent,
    publishSite,
    unpublishSite,
    clearPage,
    resetChanges
  };
}