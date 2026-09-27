import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddBlockMenu } from './AddBlockMenu';
import { BlockEditor } from './BlockEditor';
import { BlockPreview } from './BlockPreview';
import { BLOCK_TYPES } from './blockCatalog';
import { HeaderFooterSettings } from './HeaderFooterSettings';
import { DocCanvasSettings } from './DocCanvasSettings';
import { DEFAULT_PREVIEW_THEME } from './blockCatalog';

afterEach(cleanup);

describe('composable inputs and preview', () => {
  it('lets owners choose editable defaults independently for header and footer', async () => {
    const onChange = vi.fn();
    render(<HeaderFooterSettings theme={{ ...DEFAULT_PREVIEW_THEME, header: { enabled: true, text: 'Company' }, footer: { enabled: false, text: '' } }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Allow fillers to edit header' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ header: { enabled: true, text: 'Company', editable: true } }));
    expect(screen.queryByLabelText('Footer default text')).toBeNull();
  });

  it('offers the fixed-template paper presets and page padding', async () => {
    const onPageSizeChange = vi.fn();
    const onPaddingChange = vi.fn();
    render(<DocCanvasSettings pageSize="A4" format="document" orientation="portrait" spacing={12}
      onPageSizeChange={onPageSizeChange} onPaddingChange={onPaddingChange}
      onOrientationChange={vi.fn()} onFormatChange={vi.fn()} onSpacingChange={vi.fn()} />);
    for (const label of ['A4', 'A3', 'A5', 'Letter', 'Legal', 'Tabloid']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label} `) })).toBeTruthy();
    }
    await userEvent.click(screen.getByRole('button', { name: /^A3 / }));
    await userEvent.click(screen.getByRole('button', { name: 'Spacious' }));
    expect(onPageSizeChange).toHaveBeenCalledWith('A3');
    expect(onPaddingChange).toHaveBeenCalledWith(64);
  });
  it('clears optional enum fields by removing them from the payload', async () => {
    const onChange = vi.fn();
    render(
      <BlockEditor
        block={{
          id: 'h',
          type: 'heading',
          inputs: { text: 'Title', level: 1, align: 'center' },
        }}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Alignment'), '');
    expect(onChange).toHaveBeenCalledWith({ text: 'Title', level: 1 });
  });

  it('preserves column alignment while editing table cells', async () => {
    const onChange = vi.fn();
    render(
      <BlockEditor
        block={{
          id: 't',
          type: 'table',
          inputs: {
            columns: [{ label: 'Amount', align: 'right' }],
            rows: [{ cells: ['1'] }],
          },
        }}
        onChange={onChange}
      />,
    );
    await userEvent.type(screen.getByLabelText('Row 1 column 1'), '2');
    expect(onChange).toHaveBeenLastCalledWith({
      columns: [{ label: 'Amount', align: 'right' }],
      rows: [{ cells: ['12'] }],
    });
  });

  it('renders column labels and every data row with headers enabled by default', () => {
    render(
      <BlockPreview
        blocks={[
          {
            id: 't',
            type: 'table',
            inputs: {
              columns: [{ label: 'Plan' }],
              rows: [{ cells: ['Starter'] }, { cells: ['Pro'] }],
            },
          },
        ]}
      />,
    );
    expect(screen.getByRole('columnheader').textContent).toBe('Plan');
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(
      ['Starter', 'Pro'],
    );
  });

  it('keeps the add menu open while scrolling its options and cleans up Escape handlers', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<AddBlockMenu options={BLOCK_TYPES} onAdd={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }));
    const menu = screen.getByRole('menu');
    fireEvent.scroll(menu);
    expect(screen.getByRole('menu')).toBe(menu);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(remove.mock.calls.some(([event]) => event === 'keydown')).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Add block' }),
    );
  });
});
