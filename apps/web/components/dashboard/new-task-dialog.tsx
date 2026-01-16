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
import { Scroll } from 'lucide-react';

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
        const task = await response.json();

        // Auto-start the task after creation
        const startResponse = await fetch(`/api/tasks/${task.id}/start`, {
          method: 'POST',
        });

        if (!startResponse.ok) {
          const startError = await startResponse.json();
          console.error('Failed to auto-start task:', startError.error);
          // Task was created but not started - still close dialog and refresh
        }

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
        <Button className="font-display text-sm btn-golden uppercase tracking-wider">
          <Scroll className="h-4 w-4 mr-2" />
          New Quest
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] parchment-card border-primary/30 backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          {/* Top gold border accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />

          <DialogHeader className="space-y-3">
            <DialogTitle className="text-2xl font-display uppercase tracking-wider text-primary text-glow-gold flex items-center gap-3">
              <div className="wax-seal-warning text-sm">
                <Scroll className="h-4 w-4" />
              </div>
              Issue New Quest
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">
              Draft thy orders for the squire to carry forth into the realm
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-6">
            <div className="grid gap-2">
              <Label htmlFor="repo" className="font-display text-xs uppercase tracking-wider text-primary">
                Target Domain <span className="text-destructive">*</span>
              </Label>
              <Input
                id="repo"
                placeholder="e.g., owner/repository or https://github.com/..."
                value={formData.repo}
                onChange={(e) =>
                  setFormData({ ...formData, repo: e.target.value })
                }
                required
                className="medieval-input font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground italic">
                The kingdom wherein the squire shall labor
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="prompt" className="font-display text-xs uppercase tracking-wider text-primary">
                Quest Directive <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="prompt"
                placeholder="Describe the sacred mission in detail..."
                value={formData.prompt}
                onChange={(e) =>
                  setFormData({ ...formData, prompt: e.target.value })
                }
                rows={4}
                required
                className="medieval-input font-body text-sm resize-none"
              />
              <p className="text-[10px] text-muted-foreground italic">
                Inscribe thy commands with clarity and purpose
              </p>
            </div>

            <div className="manuscript-divider">
              <span className="text-muted-foreground text-xs font-display uppercase tracking-wider">Optional Provisions</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="branch" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                  Banner Name
                </Label>
                <Input
                  id="branch"
                  placeholder="Auto-generated"
                  value={formData.branch}
                  onChange={(e) =>
                    setFormData({ ...formData, branch: e.target.value })
                  }
                  className="medieval-input font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground italic">
                  The branch under which to ride
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="baseBranch" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                  Origin Keep
                </Label>
                <Input
                  id="baseBranch"
                  placeholder="main"
                  value={formData.baseBranch}
                  onChange={(e) =>
                    setFormData({ ...formData, baseBranch: e.target.value })
                  }
                  className="medieval-input font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground italic">
                  The base from which to venture
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 border-t border-primary/20 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="font-display text-xs uppercase tracking-wider border-muted/30 hover:border-destructive hover:text-destructive transition-all"
            >
              Abandon
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="font-display text-xs uppercase tracking-wider btn-golden"
            >
              {loading ? (
                <span className="animate-torch-flicker">Inscribing...</span>
              ) : (
                <>
                  <Scroll className="h-3 w-3 mr-2" />
                  Dispatch Squire
                </>
              )}
            </Button>
          </DialogFooter>

          {/* Bottom gold border accent */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
