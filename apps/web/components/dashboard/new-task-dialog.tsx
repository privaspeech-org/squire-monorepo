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
        <Button className="font-mono text-sm glow-cyan uppercase tracking-wider">
          <Plus className="h-4 w-4 mr-2" />
          NEW_TASK
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] border border-primary/30 bg-card/95 backdrop-blur-xl glow-cyan">
        <form onSubmit={handleSubmit}>
          {/* Top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

          <DialogHeader className="space-y-3">
            <DialogTitle className="text-2xl font-display uppercase tracking-wider text-primary text-glow-cyan">
              <span className="text-accent text-sm mr-2">{'>'}</span>
              INITIALIZE_NEW_TASK
            </DialogTitle>
            <DialogDescription className="font-mono text-xs text-muted-foreground border-l-2 border-primary/30 pl-3">
              <span className="text-primary">{'>'}</span> Deploy autonomous coding agent to target repository
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-6">
            <div className="grid gap-2">
              <Label htmlFor="repo" className="font-mono text-xs uppercase tracking-wider text-primary">
                <span className="text-accent">{'>'}</span> REPOSITORY <span className="text-destructive">*</span>
              </Label>
              <Input
                id="repo"
                placeholder="owner/repo or https://github.com/owner/repo"
                value={formData.repo}
                onChange={(e) =>
                  setFormData({ ...formData, repo: e.target.value })
                }
                required
                className="font-mono text-sm bg-input/50 border-primary/30 focus:border-primary focus:glow-cyan transition-all"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="prompt" className="font-mono text-xs uppercase tracking-wider text-primary">
                <span className="text-accent">{'>'}</span> TASK_PROMPT <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="prompt"
                placeholder="Describe agent objectives and requirements..."
                value={formData.prompt}
                onChange={(e) =>
                  setFormData({ ...formData, prompt: e.target.value })
                }
                rows={4}
                required
                className="font-mono text-sm bg-input/50 border-primary/30 focus:border-primary focus:glow-cyan transition-all resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="branch" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  <span className="text-primary">{'>'}</span> BRANCH_NAME
                </Label>
                <Input
                  id="branch"
                  placeholder="auto-generated"
                  value={formData.branch}
                  onChange={(e) =>
                    setFormData({ ...formData, branch: e.target.value })
                  }
                  className="font-mono text-sm bg-input/50 border-muted/30 focus:border-primary transition-all"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="baseBranch" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  <span className="text-primary">{'>'}</span> BASE_BRANCH
                </Label>
                <Input
                  id="baseBranch"
                  placeholder="main"
                  value={formData.baseBranch}
                  onChange={(e) =>
                    setFormData({ ...formData, baseBranch: e.target.value })
                  }
                  className="font-mono text-sm bg-input/50 border-muted/30 focus:border-primary transition-all"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 border-t border-primary/20 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="font-mono text-xs uppercase border-muted/30 hover:border-destructive hover:text-destructive transition-all"
            >
              CANCEL
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="font-mono text-xs uppercase glow-cyan"
            >
              {loading ? (
                <>
                  <span className="animate-pulse">INITIALIZING</span>
                  <span className="animate-pulse ml-1">...</span>
                </>
              ) : (
                <>
                  <span className="text-accent mr-1">{'>'}</span>
                  DEPLOY_AGENT
                </>
              )}
            </Button>
          </DialogFooter>

          {/* Bottom accent bar */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
