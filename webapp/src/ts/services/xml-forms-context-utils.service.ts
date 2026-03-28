import * as moment from 'moment';
import { distance } from 'fastest-levenshtein';
import { Injectable } from '@angular/core';

/**
 * Util functions available to a form doc's `.context` function for checking if
 * a form is relevant to a specific contact.
 */
@Injectable({
  providedIn: 'root'
})
export class XmlFormsContextUtilsService {
  constructor() {}

  getDateDiff(contact, unit, referenceDate: Date = new Date()) {
    if (!contact || !contact.date_of_birth) {
      return;
    }
    const dob = moment(contact.date_of_birth).startOf('day');
    return moment(referenceDate).diff(dob, unit);
  }

  ageInDays(contact, referenceDate: Date = new Date()) {
    return this.getDateDiff(contact, 'days', referenceDate);
  }

  ageInMonths(contact, referenceDate: Date = new Date()) {
    return this.getDateDiff(contact, 'months', referenceDate);
  }

  ageInYears(contact, referenceDate: Date = new Date()) {
    return this.getDateDiff(contact, 'years', referenceDate);
  }

  levenshteinEq(current: string, existing: string, threshold: number = 3) {
    return typeof current === 'string' && typeof existing === 'string' ?
      distance(current, existing) <= threshold : current === existing;
  }

  private readonly normalizedDistance = (str1: string, str2: string): number => {
    const maxLen = Math.max(str1.length, str2.length);
    return (maxLen === 0) ? 0 : (distance(str1, str2) / maxLen);
  };

  normalizedLevenshteinEq(current: string, existing: string, threshold: number = 0.42857142857142855) {
    return typeof current === 'string' && typeof existing === 'string' ?
      this.normalizedDistance(current, existing) <= threshold : current === existing;
  }
}

