/* eslint-disable */
// @ts-nocheck

import {
    Pagination,
    PaginationGap,
    PaginationList,
    PaginationNext,
    PaginationPage,
    PaginationPrevious,
} from "src/components/base/pagination";
import React from "react";
import { useTranslation } from "react-i18next";
import { LinkProps } from "src/components/base/link";

/**
 * The properties for {@link Pagination}
 */
export type TablePaginationProps = {
    /** currentPage */
    currentPage: number;
    /** currentPage */
    maxPages: number;
    href: LinkProps["href"];
    params?: LinkProps["params"];

    getSearchParams: (newPage: number) => LinkProps["search"];
};

/**
 * Display Catalyst <Pagination/>
 */
export default function TablePagination(props: TablePaginationProps) {
    const { currentPage, maxPages } = props;

    const [tg] = useTranslation();

    return (
        <Pagination>
            <PaginationPrevious
                children={tg("label.prev")}
                href={currentPage !== 1 ? props.href : null}
                params={props.params}
                search={props.getSearchParams(currentPage - 1)}
            />
            <PaginationList>
                {[...Array(maxPages).keys()].map((_, idx) => {
                    if (idx === 1 && currentPage > 3) {
                        return <PaginationGap key={idx} />;
                    } else if (idx === maxPages - 2 && currentPage < maxPages - 2) {
                        return <PaginationGap key={idx} />;
                    } else if (idx < 1) {
                        return (
                            <PaginationPage
                                href={props.href}
                                params={props.params}
                                search={props.getSearchParams(idx + 1)}
                                key={idx}
                                current={idx + 1 === currentPage}
                            >
                                {idx + 1}
                            </PaginationPage>
                        );
                    } else if (idx > maxPages - 2) {
                        return (
                            <PaginationPage
                                href={props.href}
                                params={props.params}
                                search={props.getSearchParams(idx + 1)}
                                key={idx}
                                current={idx + 1 === currentPage}
                            >
                                {idx + 1}
                            </PaginationPage>
                        );
                    } else if (idx > currentPage - 3 && idx < currentPage + 1) {
                        return (
                            <PaginationPage
                                href={props.href}
                                params={props.params}
                                search={props.getSearchParams(idx + 1)}
                                key={idx}
                                current={idx + 1 === currentPage}
                            >
                                {idx + 1}
                            </PaginationPage>
                        );
                    }
                })}
            </PaginationList>
            <PaginationNext
                children={tg("label.next")}
                href={props.currentPage < props.maxPages ? props.href : null}
                params={props.params}
                search={props.getSearchParams(currentPage + 1)}
            />
        </Pagination>
    );
}
