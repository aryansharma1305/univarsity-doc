// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Link from 'next/link';
import { SearchInput } from '@/components/data/search-input';

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/admin/students');
});
afterEach(() => vi.useRealTimers());

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function setup(target?: string, href: '/admin/imports' | '#admin-main' = '/admin/imports') {
  const change = vi.fn<(value: string) => void>();
  const rendered = render(
    <>
      <SearchInput value="" onChange={change} label="Search students" />
      <Link
        href={href}
        target={target}
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        Imports
      </Link>
    </>,
  );
  fireEvent.change(screen.getByLabelText('Search students'), {
    target: { value: 'Synthetic Student' },
  });
  return { change, ...rendered };
}

describe('student list search debounce', () => {
  it('applies search after 300 ms', async () => {
    const { change } = setup();
    await advance(299);
    expect(change).not.toHaveBeenCalled();
    await advance(1);
    expect(change).toHaveBeenCalledExactlyOnceWith('Synthetic Student');
  });

  it('cancels pending search on a link navigation before the outgoing list unmounts', async () => {
    const { change } = setup();
    fireEvent.click(screen.getByRole('link', { name: 'Imports' }));
    await advance(1000);
    expect(screen.getByLabelText('Search students')).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it('does not restart a cancelled search on rerender, but accepts new typing', async () => {
    const { change, rerender } = setup();
    fireEvent.click(screen.getByRole('link', { name: 'Imports' }));
    rerender(
      <>
        <SearchInput
          value=""
          onChange={(value) => {
            change(value);
          }}
          label="Search students"
        />
        <Link href="/admin/imports">Imports</Link>
      </>,
    );
    await advance(1000);
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'New search' } });
    await advance(300);
    expect(change).toHaveBeenCalledExactlyOnceWith('New search');
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])(
    'keeps search when a modified click does not leave this page: %j',
    async (modifiers) => {
      const { change } = setup();
      fireEvent.click(screen.getByRole('link', { name: 'Imports' }), modifiers);
      await advance(300);
      expect(change).toHaveBeenCalledExactlyOnceWith('Synthetic Student');
    },
  );

  it('keeps search when a link opens in another tab', async () => {
    const { change } = setup('_blank');
    fireEvent.click(screen.getByRole('link', { name: 'Imports' }));
    await advance(300);
    expect(change).toHaveBeenCalledExactlyOnceWith('Synthetic Student');
  });

  it('keeps search for a same-page fragment link', async () => {
    const { change } = setup(undefined, '#admin-main');
    fireEvent.click(screen.getByRole('link', { name: 'Imports' }));
    await advance(300);
    expect(change).toHaveBeenCalledExactlyOnceWith('Synthetic Student');
  });

  it('cleans up a pending search when the list unmounts', async () => {
    const { change, unmount } = setup();
    unmount();
    await advance(300);
    expect(change).not.toHaveBeenCalled();
  });
});
