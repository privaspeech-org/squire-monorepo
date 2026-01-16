'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

interface NewTaskDialogProps {
  onTaskCreated?: () => void;
}

export function NewTaskDialog({ onTaskCreated }: NewTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    repo: '',
    prompt: '',
    branch: '',
    baseBranch: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: formData.repo,
          prompt: formData.prompt,
          branch: formData.branch || undefined,
          baseBranch: formData.baseBranch || undefined,
        }),
      });

      if (response.ok) {
        setOpen(false);
        setFormData({ repo: '', prompt: '', branch: '', baseBranch: '' });
        onTaskCreated?.();
      } else {
        const error = await response.json();
        alert(`Failed to create task: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>
              Create a new coding task for Squire to execute.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="repo">Repository *</Label>
              <Input
                id="repo"
                placeholder="owner/repo or https://github.com/owner/repo"
                value={formData.repo}
                onChange={(e) =>
                  setFormData({ ...formData, repo: e.target.value })
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prompt">Task Prompt *</Label>
              <Textarea
                id="prompt"
                placeholder="Describe what you want the agent to do..."
                value={formData.prompt}
                onChange={(e) =>
                  setFormData({ ...formData, prompt: e.target.value })
                }
                rows={4}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="branch">Branch (optional)</Label>
              <Input
                id="branch"
                placeholder="Auto-generated if not provided"
                value={formData.branch}
                onChange={(e) =>
                  setFormData({ ...formData, branch: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="baseBranch">Base Branch (optional)</Label>
              <Input
                id="baseBranch"
                placeholder="main"
                value={formData.baseBranch}
                onChange={(e) =>
                  setFormData({ ...formData, baseBranch: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
