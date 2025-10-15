import { SlackExecutionPlanMessage, SlackTeamSummaryMessage, SlackBlock, SlackAttachment } from '../mcp/slack-types.js';
import { ExecutionPlan, TeamSummary } from '../mcp/types.js';

// Execution Plan Message Template
export function createExecutionPlanMessage(
  plan: ExecutionPlan,
  channelId: string,
  threadTs?: string
): SlackExecutionPlanMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📋 Your Execution Plan - ${plan.generatedAt.toLocaleDateString()}`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary*: ${plan.summary}`
      }
    },
    {
      type: 'divider'
    }
  ];

  // Add completed tickets section
  if (plan.tickets.finished.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *Completed Tickets* (${plan.tickets.finished.length})`
      }
    });

    plan.tickets.finished.forEach(ticket => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <${ticket.url}|${ticket.identifier}>: ${ticket.title}`
        }
      });
    });

    blocks.push({ type: 'divider' });
  }

  // Add in progress tickets section
  if (plan.tickets.inProgress.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔄 *In Progress* (${plan.tickets.inProgress.length})`
      }
    });

    plan.tickets.inProgress.forEach(ticket => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <${ticket.url}|${ticket.identifier}>: ${ticket.title}`
        }
      });
    });

    blocks.push({ type: 'divider' });
  }

  // Add open tickets section
  if (plan.tickets.open.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📝 *Open Tickets* (${plan.tickets.open.length})`
      }
    });

    plan.tickets.open.forEach(ticket => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <${ticket.url}|${ticket.identifier}>: ${ticket.title}`
        }
      });
    });

    blocks.push({ type: 'divider' });
  }

  // Add instructions
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Instructions*:\nPlease review and reply with any changes. Format your response as:\n• "Move [ticket-id] to [status]"\n• "Reassign [ticket-id] to [user]"\n• "Add comment to [ticket-id]: [comment]"\n\nExample: "Move PROJ-123 to in-progress" or "Reassign PROJ-456 to john.doe"`
    }
  });

  // Add action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✅ Confirm Plan'
        },
        style: 'primary',
        actionId: 'confirm_plan',
        value: plan.planId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✏️ Request Changes'
        },
        actionId: 'request_changes',
        value: plan.planId
      }
    ]
  });

  const attachments: SlackAttachment[] = [
    {
      color: '#36a64f',
      fallback: `Execution plan for ${plan.userName}`,
      title: 'Plan Details',
      text: `Plan ID: ${plan.planId}\nGenerated: ${plan.generatedAt.toISOString()}`,
      footer: 'Project Management Agent',
      ts: Math.floor(plan.generatedAt.getTime() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: `📋 Your Execution Plan - ${plan.generatedAt.toLocaleDateString()}\n\n${plan.summary}`,
    blocks,
    attachments,
    threadTs
  };
}

// Team Summary Message Template
export function createTeamSummaryMessage(
  summary: TeamSummary,
  channelId: string
): SlackTeamSummaryMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 Team Summary - ${summary.teamName}`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Tickets*\n${summary.totalTickets}`,
          short: true
        },
        {
          type: 'mrkdwn',
          text: `*Completed*\n${summary.completedTickets}`,
          short: true
        },
        {
          type: 'mrkdwn',
          text: `*In Progress*\n${summary.inProgressTickets}`,
          short: true
        },
        {
          type: 'mrkdwn',
          text: `*Open*\n${summary.openTickets}`,
          short: true
        }
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Completion Rate*: ${summary.completionRate.toFixed(1)}%`
      }
    },
    {
      type: 'divider'
    }
  ];

  // Add individual plan summaries
  summary.plans.forEach(plan => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${plan.userName}*\n• Completed: ${plan.tickets.finished.length}\n• In Progress: ${plan.tickets.inProgress.length}\n• Open: ${plan.tickets.open.length}`
      }
    });
  });

  blocks.push({ type: 'divider' });

  // Add action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📋 View Individual Plans'
        },
        actionId: 'view_individual_plans',
        value: summary.teamId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🔄 Refresh Summary'
        },
        actionId: 'refresh_summary',
        value: summary.teamId
      }
    ]
  });

  const attachments: SlackAttachment[] = [
    {
      color: '#2196F3',
      fallback: `Team summary for ${summary.teamName}`,
      title: 'Summary Details',
      text: `Team: ${summary.teamName}\nGenerated: ${summary.generatedAt.toISOString()}`,
      footer: 'Project Management Agent',
      ts: Math.floor(summary.generatedAt.getTime() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: `📊 Team Summary - ${summary.teamName}\n\nTotal: ${summary.totalTickets} | Completed: ${summary.completedTickets} | In Progress: ${summary.inProgressTickets} | Open: ${summary.openTickets}\nCompletion Rate: ${summary.completionRate.toFixed(1)}%`,
    blocks,
    attachments
  };
}

// Confirmation Message Template
export function createConfirmationMessage(
  planId: string,
  channelId: string,
  threadTs?: string
): SlackExecutionPlanMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✅ *Plan Confirmed*\n\nYour execution plan has been confirmed and will be applied to Linear.'
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Plan ID: ${planId} | Confirmed: ${new Date().toLocaleString()}`
        }
      ]
    }
  ];

  const attachments: SlackAttachment[] = [
    {
      color: '#36a64f',
      fallback: 'Plan confirmed',
      title: 'Confirmation',
      text: 'Your execution plan has been successfully confirmed.',
      footer: 'Project Management Agent',
      ts: Math.floor(Date.now() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: '✅ Plan Confirmed - Your execution plan has been confirmed and will be applied to Linear.',
    blocks,
    attachments,
    threadTs
  };
}

// Error Message Template
export function createErrorMessage(
  error: string,
  channelId: string,
  threadTs?: string
): SlackExecutionPlanMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `❌ *Error*\n\n${error}`
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Error occurred: ${new Date().toLocaleString()}`
        }
      ]
    }
  ];

  const attachments: SlackAttachment[] = [
    {
      color: '#f44336',
      fallback: 'Error occurred',
      title: 'Error Details',
      text: error,
      footer: 'Project Management Agent',
      ts: Math.floor(Date.now() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: `❌ Error: ${error}`,
    blocks,
    attachments,
    threadTs
  };
}

// Help Message Template
export function createHelpMessage(
  channelId: string,
  threadTs?: string
): SlackExecutionPlanMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '❓ How to Use Execution Plans'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Available Commands:*\n\n• `Move [ticket-id] to [status]` - Change ticket status\n• `Reassign [ticket-id] to [user]` - Reassign ticket\n• `Add comment to [ticket-id]: [comment]` - Add comment\n• `Confirm` - Confirm the entire plan\n• `Help` - Show this help message'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Examples:*\n\n• `Move PROJ-123 to in-progress`\n• `Reassign PROJ-456 to john.doe`\n• `Add comment to PROJ-789: Starting work on this today`\n• `Confirm`'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Status Values:*\n\n• `backlog` - Move to backlog\n• `unstarted` - Move to unstarted\n• `in-progress` - Move to in progress\n• `completed` - Mark as completed\n• `canceled` - Cancel the ticket'
      }
    }
  ];

  const attachments: SlackAttachment[] = [
    {
      color: '#2196F3',
      fallback: 'Help information',
      title: 'Help',
      text: 'Available commands and examples for using execution plans.',
      footer: 'Project Management Agent',
      ts: Math.floor(Date.now() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: '❓ How to Use Execution Plans - Available commands and examples.',
    blocks,
    attachments,
    threadTs
  };
}

// Plan Modification Message Template
export function createPlanModificationMessage(
  planId: string,
  modifications: any[],
  channelId: string,
  threadTs?: string
): SlackExecutionPlanMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✏️ *Plan Modified*\n\nYour execution plan has been updated with the following changes:'
      }
    },
    {
      type: 'divider'
    }
  ];

  // Add modification details
  modifications.forEach((mod, index) => {
    let modificationText = '';
    switch (mod.action) {
      case 'status_change':
        modificationText = `• *${mod.ticketId}*: Status changed to \`${mod.value}\``;
        break;
      case 'reassign':
        modificationText = `• *${mod.ticketId}*: Reassigned to \`${mod.value}\``;
        break;
      case 'comment':
        modificationText = `• *${mod.ticketId}*: Comment added - "${mod.value}"`;
        break;
      default:
        modificationText = `• *${mod.ticketId}*: ${mod.action} - ${mod.value}`;
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: modificationText
      }
    });
  });

  blocks.push({ type: 'divider' });

  // Add action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✅ Confirm Changes'
        },
        style: 'primary',
        actionId: 'confirm_plan',
        value: planId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✏️ Make More Changes'
        },
        actionId: 'request_changes',
        value: planId
      }
    ]
  });

  const attachments: SlackAttachment[] = [
    {
      color: '#f39c12',
      fallback: 'Plan modified',
      title: 'Modification Details',
      text: `${modifications.length} modification(s) applied to plan ${planId}`,
      footer: 'Project Management Agent',
      ts: Math.floor(Date.now() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: `✏️ Plan Modified - ${modifications.length} change(s) applied to plan ${planId}`,
    blocks,
    attachments,
    threadTs
  };
}

// Reminder Message Template
export function createReminderMessage(
  planId: string,
  userName: string,
  channelId: string,
  threadTs?: string
): SlackExecutionPlanMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⏰ *Reminder for ${userName}*\n\nPlease review and confirm your execution plan. If you need help, reply with "help".`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Quick Actions:*\n\n• Reply with "Confirm" to approve your plan\n• Reply with "Help" for assistance\n• Use the buttons below for quick actions'
      }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Confirm Plan'
          },
          style: 'primary',
          actionId: 'confirm_plan',
          value: planId
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❓ Get Help'
          },
          actionId: 'request_changes',
          value: planId
        }
      ]
    }
  ];

  const attachments: SlackAttachment[] = [
    {
      color: '#e67e22',
      fallback: 'Reminder notification',
      title: 'Plan Review Reminder',
      text: `Please review your execution plan ${planId}`,
      footer: 'Project Management Agent',
      ts: Math.floor(Date.now() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: `⏰ Reminder: Please review your execution plan ${planId}`,
    blocks,
    attachments,
    threadTs
  };
}

// Plan Status Update Template
export function createPlanStatusUpdateMessage(
  planId: string,
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled',
  channelId: string,
  threadTs?: string
): SlackExecutionPlanMessage {
  const statusEmojis = {
    pending: '⏳',
    confirmed: '✅',
    in_progress: '🔄',
    completed: '🎉',
    cancelled: '❌'
  };

  const statusColors = {
    pending: '#f39c12',
    confirmed: '#36a64f',
    in_progress: '#2196F3',
    completed: '#9b59b6',
    cancelled: '#e74c3c'
  };

  const statusTexts = {
    pending: 'Pending Review',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled'
  };

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmojis[status]} *Plan Status Update*\n\nPlan ${planId} is now **${statusTexts[status]}**`
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Updated: ${new Date().toLocaleString()}`
        }
      ]
    }
  ];

  const attachments: SlackAttachment[] = [
    {
      color: statusColors[status],
      fallback: `Plan ${planId} status: ${status}`,
      title: 'Status Update',
      text: `Plan ${planId} is now ${statusTexts[status]}`,
      footer: 'Project Management Agent',
      ts: Math.floor(Date.now() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: `${statusEmojis[status]} Plan ${planId} status: ${statusTexts[status]}`,
    blocks,
    attachments,
    threadTs
  };
}

// Validation Error Message Template
export function createValidationErrorMessage(
  errors: string[],
  warnings: string[],
  channelId: string,
  threadTs?: string
): SlackExecutionPlanMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '❌ *Validation Errors*\n\nYour modifications could not be processed due to the following errors:'
      }
    },
    {
      type: 'divider'
    }
  ];

  // Add error details
  errors.forEach(error => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `• ${error}`
      }
    });
  });

  // Add warnings if any
  if (warnings.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Warnings:*'
      }
    });

    warnings.forEach(warning => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• ⚠️ ${warning}`
        }
      });
    });
  }

  blocks.push({ type: 'divider' });

  // Add help section
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Need Help?*\n\nReply with "help" to see available commands and examples.'
    }
  });

  const attachments: SlackAttachment[] = [
    {
      color: '#e74c3c',
      fallback: 'Validation errors',
      title: 'Validation Failed',
      text: `${errors.length} error(s) found in your modifications`,
      footer: 'Project Management Agent',
      ts: Math.floor(Date.now() / 1000)
    }
  ];

  return {
    channel: channelId,
    text: `❌ Validation Errors - ${errors.length} error(s) found`,
    blocks,
    attachments,
    threadTs
  };
}