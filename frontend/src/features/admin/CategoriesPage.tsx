import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '@/api/categories';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Checkbox, FormError, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Spinner';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';
import { applyApiErrors, errorMessage } from '@/lib/errors';
import { categorySchema, type CategoryValues } from '@/types/schemas';
import type { Category } from '@/types/api';
import { categoryIcon } from '@/features/customer/CategoryPicker';

export function CategoriesPage() {
  const q = useCategories(true);
  const del = useDeleteCategory();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Service categories"
        description="Inactive categories are excluded from new searches. Deleting a category in use deactivates it instead."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add category
          </Button>
        }
      />
      {q.isLoading ? (
        <SkeletonList rows={4} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          icon={<Tags className="size-6" />}
          title="No categories"
          action={<Button onClick={() => setEditing('new')}>Add category</Button>}
        />
      ) : (
        <Table caption="Service categories">
          <THead>
            <tr>
              <Th>Name</Th>
              <Th className="hidden md:table-cell">Description</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </THead>
          <TBody>
            {q.data.map((c) => {
              const Icon = categoryIcon(c);
              return (
                <Tr key={c.id}>
                  <Td>
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <Icon className="size-4 text-slate-400" aria-hidden="true" /> {c.name}
                    </span>
                    <span className="block text-xs text-slate-500">{c.slug}</span>
                  </Td>
                  <Td className="hidden max-w-sm md:table-cell">{c.description || '—'}</Td>
                  <Td>
                    {c.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil className="size-4" />}
                      onClick={() => setEditing(c)}
                    >
                      Edit
                    </Button>
                    {c.is_active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700"
                        onClick={() => setDeleting(c)}
                      >
                        Delete
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
      {editing && (
        <CategoryModal category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete “${deleting?.name}”?`}
        description="If technicians or bookings use this category it will be deactivated instead of deleted."
        confirmLabel="Delete"
        tone="danger"
        loading={del.isPending}
        error={error}
        onClose={() => {
          setDeleting(null);
          setError(null);
        }}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast.success('Category removed (or deactivated if in use).');
            setDeleting(null);
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      />
    </div>
  );
}

function CategoryModal({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: category
      ? {
          name: category.name,
          description: category.description ?? '',
          icon: category.icon ?? '',
          is_active: category.is_active,
        }
      : { name: '', description: '', icon: 'wrench', is_active: true },
  });
  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      if (category) await update.mutateAsync({ id: category.id, body: v });
      else await create.mutateAsync(v);
      toast.success(category ? 'Category updated.' : 'Category added.');
      onClose();
    } catch (err) {
      setFormError(applyApiErrors(err, setError, ['name', 'description', 'icon', 'is_active']));
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={category ? 'Edit category' : 'Add category'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="cat-form" loading={isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="cat-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="Name" required error={errors.name?.message} {...register('name')} />
        <Textarea label="Description" error={errors.description?.message} {...register('description')} />
        <Input
          label="Icon name"
          hint="Short icon keyword, e.g. snowflake, zap, droplet, wrench, hammer, laptop, home, flame."
          error={errors.icon?.message}
          {...register('icon')}
        />
        <Checkbox
          label="Active"
          description="Inactive categories don’t appear in searches."
          {...register('is_active')}
        />
        <FormError message={formError} />
      </form>
    </Modal>
  );
}
