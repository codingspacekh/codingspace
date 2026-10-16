import { useRouter } from 'next/router';
import { postFilters, type PostFilters } from '@/lib/admin-posts';
import { AdminShell } from '@/views/admin/admin-shell';
import { PostsBrowser } from '@/views/admin/posts-browser';

export default function AdminPosts() {
  const router = useRouter();
  // Filters live in the address bar, so a filtered list can be bookmarked or reloaded.
  const filters = router.isReady ? postFilters(router.query) : null;
  const setFilters = (f: PostFilters) =>
    router.replace({ pathname: '/admin/posts', query: postFilters(f) }, undefined, { shallow: true });

  return (
    <AdminShell title="Posts">
      {() => (
        <>
          <h1>Posts</h1>
          {filters && <PostsBrowser filters={filters} onFilters={setFilters} />}
        </>
      )}
    </AdminShell>
  );
}
