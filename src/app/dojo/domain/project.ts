/** A file of the project on the screen: where it lies and what it holds, as IntelliJ would open it. */
interface ProjectFile {
  readonly folder: string;
  readonly lines: readonly string[];
}

const KOTLIN = 'backend/src/main/kotlin/de/shop/order';
const FRONTEND = 'frontend/src/app/orders';

const FILES: Readonly<Record<string, ProjectFile>> = {
  'Order.kt': {
    folder: KOTLIN,
    lines: [
      'package de.shop.order',
      '',
      'data class Order(',
      '    val id: Long = 0,',
      '    val customer: String,',
      '    val items: List<Item>,',
      '    val total: Int = 0,',
      '    val status: Status = Status.NEW,',
      ')',
      '',
      'data class Item(val name: String, val price: Int)',
      '',
      'enum class Status { NEW, PAID, CANCELLED }',
    ],
  },
  'InvoiceService.kt': {
    folder: 'backend/src/main/kotlin/de/shop/invoice',
    lines: [
      'package de.shop.invoice',
      '',
      'import de.shop.order.Order',
      'import de.shop.order.OrderRepository',
      'import org.springframework.data.repository.findByIdOrNull',
      'import org.springframework.stereotype.Service',
      'import org.springframework.transaction.annotation.Transactional',
      'import java.time.Clock',
      'import java.time.LocalDate',
      '',
      '@Service',
      'class InvoiceService(',
      '    private val invoices: InvoiceRepository,',
      '    private val orders: OrderRepository,',
      '    private val mailer: InvoiceMailer,',
      '    private val clock: Clock,',
      ') {',
      '    @Transactional',
      '    fun create(orderId: Long): Invoice {',
      '        val order = orders.findByIdOrNull(orderId)',
      '            ?: throw OrderNotFound(orderId)',
      '        val invoice = Invoice(',
      '            number = nextNumber(),',
      '            orderId = order.id,',
      '            customer = order.customer,',
      '            net = netOf(order),',
      '            issued = today(),',
      '            due = today().plusDays(PAYMENT_DAYS),',
      '        )',
      '        return invoices.save(invoice)',
      '    }',
      '',
      '    fun find(number: String): Invoice? =',
      '        invoices.findByNumber(number)',
      '',
      '    fun forCustomer(customer: String): List<Invoice> =',
      '        invoices.findAllByCustomer(customer)',
      '',
      '    fun unpaid(): List<Invoice> =',
      '        invoices.findAllByPaidIsNull()',
      '',
      '    fun overdue(): List<Invoice> =',
      '        unpaid().filter { it.due < today() }',
      '',
      '    fun netOf(order: Order): Int =',
      '        order.items.sumOf { it.price }',
      '',
      '    fun taxOf(invoice: Invoice): Int =',
      '        invoice.net * TAX_PERCENT / 100',
      '',
      '    fun grossOf(invoice: Invoice): Int =',
      '        invoice.net + taxOf(invoice)',
      '',
      '    @Transactional',
      '    fun send(number: String) {',
      '        val invoice = find(number) ?: return',
      '        mailer.send(invoice.customer, invoice)',
      '        invoices.save(invoice.copy(sent = today()))',
      '    }',
      '',
      '    @Transactional',
      '    fun remind(number: String) {',
      '        val invoice = find(number) ?: return',
      '        if (invoice.paid != null) return',
      '        val level = invoice.reminders + 1',
      '        mailer.remind(invoice.customer, invoice, level)',
      '        invoices.save(invoice.copy(reminders = level))',
      '    }',
      '',
      '    @Transactional',
      '    fun remindAll(): Int {',
      '        val late = overdue()',
      '        late.forEach { remind(it.number) }',
      '        return late.size',
      '    }',
      '',
      '    @Transactional',
      '    fun markPaid(number: String, on: LocalDate) {',
      '        val invoice = find(number) ?: return',
      '        invoices.save(invoice.copy(paid = on))',
      '    }',
      '',
      '    @Transactional',
      '    fun cancel(number: String): Invoice? {',
      '        val invoice = find(number) ?: return null',
      '        if (invoice.paid != null) return null',
      '        val storno = invoice.copy(',
      '            number = nextNumber(),',
      '            net = -invoice.net,',
      '            cancels = invoice.number,',
      '        )',
      '        return invoices.save(storno)',
      '    }',
      '',
      '    fun revenue(year: Int): Int =',
      '        invoices.findAllByYear(year).sumOf { grossOf(it) }',
      '',
      '    private fun nextNumber(): String {',
      '        val year = today().year',
      '        val count = invoices.countByYear(year) + 1',
      '        return "RE-$year-${count.toString().padStart(4, \'0\')}"',
      '    }',
      '',
      '    private fun today(): LocalDate = LocalDate.now(clock)',
      '',
      '    companion object {',
      '        const val TAX_PERCENT = 19',
      '        const val PAYMENT_DAYS = 14L',
      '    }',
      '}',
    ],
  },
  'OrderController.kt': {
    folder: KOTLIN,
    lines: [
      'package de.shop.order',
      '',
      'import org.springframework.web.bind.annotation.*',
      '',
      '@RestController',
      '@RequestMapping("/api/orders")',
      'class OrderController(private val service: OrderService) {',
      '',
      '    @GetMapping("/{id}")',
      '    fun find(@PathVariable id: Long): Order? = service.find(id)',
      '',
      '    @GetMapping',
      '    fun byCustomer(@RequestParam customer: String) = service.byCustomer(customer)',
      '',
      '    @PostMapping',
      '    fun create(@RequestBody order: Order): Order = service.place(order)',
      '',
      '    @DeleteMapping("/{id}")',
      '    fun cancel(@PathVariable id: Long) = service.cancel(id)',
      '}',
    ],
  },
  'OrderRepository.kt': {
    folder: KOTLIN,
    lines: [
      'package de.shop.order',
      '',
      'import org.springframework.data.jpa.repository.JpaRepository',
      '',
      'interface OrderRepository : JpaRepository<Order, Long> {',
      '    fun findByCustomer(customer: String): List<Order>',
      '    fun countByStatus(status: Status): Long',
      '}',
    ],
  },
  'OrderService.kt': {
    folder: KOTLIN,
    lines: [
      'package de.shop.order',
      '',
      'import org.springframework.data.repository.findByIdOrNull',
      'import org.springframework.stereotype.Service',
      'import org.springframework.transaction.annotation.Transactional',
      '',
      '@Service',
      'class OrderService(',
      '    private val repo: OrderRepository,',
      '    private val prices: PriceCalculator,',
      ') {',
      '    @Transactional',
      '    fun place(order: Order): Order {',
      '        check(order.items.isNotEmpty())',
      '        return repo.save(order.copy(total = prices.total(order)))',
      '    }',
      '',
      '    fun find(id: Long): Order? = repo.findByIdOrNull(id)',
      '',
      '    fun byCustomer(customer: String): List<Order> = repo.findByCustomer(customer)',
      '',
      '    @Transactional',
      '    fun cancel(id: Long) {',
      '        val order = find(id) ?: return',
      '        repo.save(order.copy(status = Status.CANCELLED))',
      '    }',
      '}',
    ],
  },
  'PriceCalculator.kt': {
    folder: KOTLIN,
    lines: [
      'package de.shop.order',
      '',
      'import org.springframework.stereotype.Component',
      '',
      '@Component',
      'class PriceCalculator {',
      '    fun net(gross: Int): Int = gross * 100 / 119',
      '',
      '    fun total(order: Order): Int {',
      '        val sum = order.items.sumOf { it.price }',
      '        return sum - discount(order)',
      '    }',
      '',
      '    private fun discount(order: Order): Int =',
      '        if (order.items.size >= 10) order.items.sumOf { it.price } / 10 else 0',
      '}',
    ],
  },
  'application.yml': {
    folder: 'backend/src/main/resources',
    lines: [
      'spring:',
      '  datasource:',
      '    url: jdbc:postgresql://localhost/shop',
      '    username: shop',
      '  jpa:',
      '    open-in-view: false',
      'server:',
      '  port: 8080',
    ],
  },
  'V3__orders.sql': {
    folder: 'backend/src/main/resources/db/migration',
    lines: [
      'CREATE TABLE orders (',
      '    id BIGINT PRIMARY KEY,',
      '    customer VARCHAR(100) NOT NULL,',
      '    total INT NOT NULL,',
      '    status VARCHAR(20) NOT NULL',
      ');',
      '',
      'CREATE INDEX idx_orders_customer ON orders (customer);',
    ],
  },
  'OrderServiceTest.kt': {
    folder: 'backend/src/test/kotlin/de/shop/order',
    lines: [
      'package de.shop.order',
      '',
      'import org.junit.jupiter.api.Test',
      'import kotlin.test.assertEquals',
      'import kotlin.test.assertFails',
      '',
      'class OrderServiceTest {',
      '',
      '    private val service = OrderService(FakeRepository(), PriceCalculator())',
      '',
      '    @Test',
      '    fun `rejects an empty order`() {',
      '        assertFails { service.place(Order(customer = "anna", items = emptyList())) }',
      '    }',
      '',
      '    @Test',
      '    fun `adds up the total`() {',
      '        val order = service.place(Order(customer = "anna", items = listOf(Item("tea", 400))))',
      '        assertEquals(400, order.total)',
      '    }',
      '}',
    ],
  },
  'order.ts': {
    folder: FRONTEND,
    lines: [
      'export interface Order {',
      '  readonly id: number;',
      '  readonly customer: string;',
      '  readonly total: number;',
      "  readonly status: 'NEW' | 'PAID' | 'CANCELLED';",
      '}',
    ],
  },
  'order-api.ts': {
    folder: FRONTEND,
    lines: [
      "import { HttpClient } from '@angular/common/http';",
      "import { inject, Injectable } from '@angular/core';",
      '',
      "import type { Order } from './order';",
      '',
      "@Injectable({ providedIn: 'root' })",
      'export class OrderApi {',
      '  private readonly http = inject(HttpClient);',
      "  readonly base = '/api/orders';",
      '',
      '  byCustomer(customer: string) {',
      '    return this.http.get<Order[]>(this.base, { params: { customer } });',
      '  }',
      '',
      '  cancel(id: number) {',
      '    return this.http.delete<void>(`${this.base}/${id}`);',
      '  }',
      '}',
    ],
  },
  'order-list.html': {
    folder: FRONTEND,
    lines: [
      '<h2>{{ title }}</h2>',
      '@if (state.open().length === 0) {',
      '  <p class="hint">Keine offenen Bestellungen</p>',
      '}',
      '<ul>',
      '  @for (order of state.open(); track order.id) {',
      '    <li>{{ order.customer }}: {{ order.total }}</li>',
      '  }',
      '</ul>',
    ],
  },
  'order-list.ts': {
    folder: FRONTEND,
    lines: [
      "import { Component, inject } from '@angular/core';",
      '',
      "import { OrderState } from './order-state';",
      '',
      "@Component({ selector: 'app-order-list', templateUrl: './order-list.html' })",
      'export class OrderList {',
      '  protected readonly state = inject(OrderState);',
      "  readonly title = 'Bestellungen';",
      '}',
    ],
  },
  'order-state.ts': {
    folder: FRONTEND,
    lines: [
      "import { computed, inject, Injectable, signal } from '@angular/core';",
      '',
      "import { OrderApi } from './order-api';",
      "import type { Order } from './order';",
      '',
      "@Injectable({ providedIn: 'root' })",
      'export class OrderState {',
      '  private readonly api = inject(OrderApi);',
      '  private readonly orders = signal<Order[]>([]);',
      '',
      "  readonly open = computed(() => this.orders().filter((order) => order.status === 'NEW'));",
      '  readonly total = computed(() => this.orders().reduce((sum, order) => sum + order.total, 0));',
      '',
      '  load(customer: string): void {',
      '    this.api.byCustomer(customer).subscribe((orders) => this.orders.set(orders));',
      '  }',
      '}',
    ],
  },
};

/** The file names of the project, in the order of the project view. */
export const FILE_NAMES: readonly string[] = Object.keys(FILES).sort(
  (a, b) => FILES[a].folder.localeCompare(FILES[b].folder) || a.localeCompare(b),
);

export const isProjectFile = (file: string): boolean => file in FILES;

export const fileLines = (file: string): readonly string[] => FILES[file]?.lines ?? [];

export const fileText = (file: string): string => fileLines(file).join('\n');

interface TreeRow {
  readonly key: string;
  readonly label: string;
  readonly depth: number;
  /** The file of a row, null for a folder. */
  readonly file: string | null;
}

/** A folder as IntelliJ names it with compact packages: `de.shop.order`, tests marked, `src/main` left out. */
const folderLabel = (path: string): string =>
  path
    .replace(
      /^src\/(main|test)\/kotlin\/(.*)$/,
      (_, root: string, pkg: string) => `${root === 'test' ? 'test · ' : ''}${pkg.replaceAll('/', '.')}`,
    )
    .replace(/^src\/main\//, '')
    .replace(/^src\//, '');

/** The project view: the project, its two halves, their folders with the middle packages joined up, the files. */
export const TREE: readonly TreeRow[] = (() => {
  const rows: TreeRow[] = [{ key: 'shop', label: 'shop', depth: 0, file: null }];
  const folders = [...new Set(FILE_NAMES.map((file) => FILES[file].folder))];
  for (const half of [...new Set(folders.map((folder) => folder.split('/')[0]))]) {
    rows.push({ key: half, label: half, depth: 1, file: null });
    for (const folder of folders.filter((each) => each.startsWith(`${half}/`))) {
      rows.push({ key: folder, label: folderLabel(folder.slice(half.length + 1)), depth: 2, file: null });
      for (const file of FILE_NAMES.filter((each) => FILES[each].folder === folder)) {
        rows.push({ key: file, label: file, depth: 3, file });
      }
    }
  }
  return rows;
})();

/** A place in a file: its line, counted from 1, and the text standing there. */
export interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hitsOf(pattern: RegExp): Hit[] {
  return FILE_NAMES.flatMap((file) =>
    FILES[file].lines.flatMap((text, index) => (pattern.test(text) ? [{ file, line: index + 1, text }] : [])),
  );
}

/** Find in Files: every line that holds the text, without regard to case. */
export const search = (query: string): Hit[] =>
  query.trim() === '' ? [] : hitsOf(new RegExp(escaped(query.trim()), 'i'));

/** Find Usages: every line that holds the word as a whole word. */
export const usagesOf = (word: string): Hit[] => hitsOf(new RegExp(`\\b${escaped(word)}\\b`));

const DECLARES = (symbol: string) =>
  new RegExp(`\\b(?:class|interface|object|fun|function)\\s+${escaped(symbol)}\\b`);

/** Go to Declaration: the line that declares a class, an interface or a function of that name. */
export const declarationOf = (symbol: string): Hit | null => hitsOf(DECLARES(symbol))[0] ?? null;

/** Go to Test: the test of a Kotlin class, where there is one. */
export function testOf(file: string): string | null {
  const test = file.replace(/\.kt$/, 'Test.kt');
  return test !== file && isProjectFile(test) ? test : null;
}

const MEMBER =
  /^\s*(?:@\w+\s+)?(?:(?:private|protected|override|export|data|enum|readonly)\s+)*(?:(?:class|interface|object|fun|function)\s+)?`?([A-Za-z][\w ]*?)`?\s*[(:=<{]/;
const DECLARING = /\b(?:class|interface|object|fun|function|readonly)\b|^\s{2}[a-z]\w*\(/;

/** File Structure: what the file declares, by name, with the line it is on. */
export function membersOf(file: string): Hit[] {
  return (FILES[file]?.lines ?? []).flatMap((text, index) => {
    if (!DECLARING.test(text) || /^\s*(?:import|return|package)\b/.test(text)) return [];
    const name = MEMBER.exec(text)?.[1]?.trim();
    return name ? [{ file, line: index + 1, text: name }] : [];
  });
}

/** Where the cursor stands on a line: on its first character that is no space. */
export function offsetOf(text: string, line: number): number {
  const lines = text.split('\n');
  const before = lines.slice(0, line - 1).reduce((sum, each) => sum + each.length + 1, 0);
  return before + (lines[line - 1]?.search(/\S/) ?? 0);
}

/** The first place a word stands in a text as a whole word, -1 where it does not. */
export const wordAt = (text: string, word: string): number =>
  text.search(new RegExp(`\\b${escaped(word)}\\b`));
