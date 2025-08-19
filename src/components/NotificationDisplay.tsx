import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  IconButton,
  Stack
} from '@mui/material';
import {
  Close as CloseIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import type { Notification } from '../types';

const getAlertIcon = (type: Notification['type']) => {
  switch (type) {
    case 'warning': return <WarningIcon />;
    case 'error': return <ErrorIcon />;
    case 'success': return <SuccessIcon />;
    case 'info': return <InfoIcon />;
    default: return <InfoIcon />;
  }
};

const getAlertSeverity = (type: Notification['type']): 'error' | 'warning' | 'info' | 'success' => {
  switch (type) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'success': return 'success';
    case 'info': return 'info';
    default: return 'info';
  }
};

export const NotificationDisplay: React.FC = () => {
  const { notifications, removeNotification } = useAppStore();
  
  // Only show the most recent notification in a snackbar style
  const currentNotification = notifications[notifications.length - 1];

  const handleClose = (notificationId: string) => {
    removeNotification(notificationId);
  };

  if (!currentNotification) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 80, // Below toolbar
        right: 16,
        zIndex: 1400,
        maxWidth: 400
      }}
    >
      <Stack spacing={1}>
        {/* Show only the most recent notification as a persistent alert */}
        <Alert
          severity={getAlertSeverity(currentNotification.type)}
          icon={getAlertIcon(currentNotification.type)}
          action={
            <IconButton
              color="inherit"
              size="small"
              onClick={() => handleClose(currentNotification.id)}
              aria-label="close"
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
          sx={{
            minWidth: 300,
            maxWidth: 400,
            boxShadow: 3,
            border: 1,
            borderColor: 'divider'
          }}
        >
          <AlertTitle sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
            {currentNotification.title}
          </AlertTitle>
          {currentNotification.message}
        </Alert>
      </Stack>
    </Box>
  );
};