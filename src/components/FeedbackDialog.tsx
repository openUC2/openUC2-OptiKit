import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Feedback as FeedbackIcon,
  Send as SendIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  trigger?: 'download' | 'github' | 'manual';
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ 
  open, 
  onClose, 
  trigger = 'manual' 
}) => {
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'improvement' | 'other'>('improvement');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  const { submitFeedback } = useAppStore();

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const feedbackData = {
        type: feedbackType,
        title: title.trim(),
        description: description.trim(),
        email: email.trim(),
        trigger,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      await submitFeedback(feedbackData);
      setSubmitStatus('success');
      
      // Auto-close after success
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setEmail('');
    setFeedbackType('improvement');
    setSubmitStatus('idle');
    setIsSubmitting(false);
    onClose();
  };

  const getTriggerMessage = () => {
    switch (trigger) {
      case 'download':
        return 'Since you\'re downloading your setup, we\'d love to hear about your experience!';
      case 'github':
        return 'Since you\'re saving to GitHub, we\'d love to hear about your experience!';
      default:
        return 'We\'d love to hear your thoughts about OptiKit!';
    }
  };

  const getFeedbackTypeLabel = (type: string) => {
    switch (type) {
      case 'bug': return '🐛 Bug Report';
      case 'feature': return '✨ Feature Request';
      case 'improvement': return '🔧 Improvement Suggestion';
      case 'other': return '💬 General Feedback';
      default: return type;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <FeedbackIcon color="primary" />
        Share Your Feedback
      </DialogTitle>
      
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {getTriggerMessage()}
        </Typography>

        {submitStatus === 'success' && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Thank you! Your feedback has been submitted successfully.
          </Alert>
        )}

        {submitStatus === 'error' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to submit feedback. Please try again or contact us directly.
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Feedback Type</InputLabel>
            <Select
              value={feedbackType}
              label="Feedback Type"
              onChange={(e) => setFeedbackType(e.target.value as any)}
              disabled={isSubmitting}
            >
              <MenuItem value="improvement">{getFeedbackTypeLabel('improvement')}</MenuItem>
              <MenuItem value="feature">{getFeedbackTypeLabel('feature')}</MenuItem>
              <MenuItem value="bug">{getFeedbackTypeLabel('bug')}</MenuItem>
              <MenuItem value="other">{getFeedbackTypeLabel('other')}</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief summary of your feedback"
            fullWidth
            disabled={isSubmitting}
            required
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell us more about your idea, problem, or suggestion..."
            multiline
            rows={4}
            fullWidth
            disabled={isSubmitting}
            required
          />

          <TextField
            label="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            type="email"
            fullWidth
            disabled={isSubmitting}
            helperText="We'll only use this to follow up on your feedback if needed"
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button 
          onClick={handleClose}
          disabled={isSubmitting}
          startIcon={<CancelIcon />}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit}
          variant="contained"
          disabled={!title.trim() || !description.trim() || isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : <SendIcon />}
        >
          {isSubmitting ? 'Submitting...' : 'Send Feedback'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};